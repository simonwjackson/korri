import { afterEach, describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  BTN_A,
  BTN_BACK,
  BTN_SELECT,
  BTN_START,
  BTN_TL,
  BTN_TR,
  KEY_BRIGHTNESSUP,
  KEY_POWER,
  KEY_RECORD,
  KEY_VOLUMEUP,
  SW_LID,
} from "@shared/input/native/button-codes"
import { decodeNativeInputEvent } from "@shared/input/native/wire-schema"
import { type KorriInputdHandle, startKorriInputd } from "./inputd"
import type { KorriInputdActionId } from "./inputd-actions"

const PROC_FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/proc")
const handles: KorriInputdHandle[] = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map(handle => handle.stop()))
})

async function loadProcFixture(name: string): Promise<string> {
  return readFile(join(PROC_FIXTURES_DIR, name), "utf8")
}

function createControllableEventSource() {
  const chunks: Uint8Array[] = []
  const waiters: Array<(chunk: Uint8Array | undefined) => void> = []
  let closed = false

  async function* stream() {
    while (true) {
      if (chunks.length > 0) {
        yield chunks.shift() as Uint8Array
        continue
      }
      if (closed) return

      const chunk = await new Promise<Uint8Array | undefined>(resolve => {
        waiters.push(resolve)
      })
      if (!chunk) return
      yield chunk
    }
  }

  return {
    open: () => ({
      [Symbol.asyncIterator]: stream,
      close: () => {
        closed = true
        for (const waiter of waiters.splice(0)) waiter(undefined)
      },
    }),
    push: (chunk: Uint8Array) => {
      const waiter = waiters.shift()
      if (waiter) {
        waiter(chunk)
        return
      }
      chunks.push(chunk)
    },
    close: () => {
      closed = true
      for (const waiter of waiters.splice(0)) waiter(undefined)
    },
  }
}

async function startInputd(options: Parameters<typeof startKorriInputd>[0]) {
  const handle = await startKorriInputd({
    port: 0,
    pollIntervalMs: 10_000,
    logger: silentLogger,
    ...options,
  })
  handles.push(handle)
  return handle
}

function connectClient(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`)
  const messages: unknown[] = []
  const waiters: Array<(message: unknown) => void> = []

  ws.addEventListener("message", event => {
    const message = JSON.parse(String(event.data))
    messages.push(message)
    const waiter = waiters.shift()
    if (waiter) waiter(message)
  })

  return {
    ws,
    messages,
    open: () =>
      new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true })
        ws.addEventListener("error", () => reject(new Error("ws error")), {
          once: true,
        })
      }),
    nextMessage: () => {
      if (messages.length > 0)
        return Promise.resolve(messages[messages.length - 1])
      return new Promise<unknown>(resolve => waiters.push(resolve))
    },
    close: () => ws.close(),
  }
}

async function waitFor(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(10)
  }
  throw new Error(`timed out waiting for ${description}`)
}

describe("korri inputd", () => {
  it("keeps the native input bridge contract for gamepad subscribers", async () => {
    const proc = await loadProcFixture("bus-input-devices-odin.txt")
    const source = createControllableEventSource()
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event9"
          ? source.open()
          : createControllableEventSource().open(),
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))

    const deviceAdded = decodeNativeInputEvent(await client.nextMessage())
    expect(deviceAdded.kind).toBe("device-added")

    source.push(evdevKey(BTN_TL, 1))
    await waitFor(
      () =>
        client.messages
          .map(message => decodeNativeInputEvent(message))
          .some(message => message.kind === "input"),
      "input event",
    )

    const input = client.messages
      .map(message => decodeNativeInputEvent(message))
      .find(message => message.kind === "input")
    expect(input).toMatchObject({
      kind: "input",
      deviceId: "inputplumber-virtual-xbox360",
      class: "gamepad",
      type: 1,
      code: BTN_TL,
      value: 1,
    })

    client.close()
  })

  it("dispatches the exact kill-game chord once while still streaming input", async () => {
    const proc = await loadProcFixture("bus-input-devices-odin.txt")
    const source = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event9"
          ? source.open()
          : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    await client.nextMessage()

    source.push(evdevKey(BTN_TL, 1))
    source.push(evdevKey(BTN_TR, 1))
    source.push(evdevKey(BTN_SELECT, 1))
    source.push(evdevKey(BTN_START, 1))
    source.push(evdevKey(BTN_START, 2))

    await waitFor(() => actions.length === 1, "kill action")
    expect(actions).toEqual(["kill-current-game"])
    await waitFor(
      () =>
        client.messages
          .map(message => decodeNativeInputEvent(message))
          .filter(message => message.kind === "input").length >= 4,
      "streamed chord events",
    )

    client.close()
  })

  it("maps retained system keys, switch events, and screen-switch shortcuts to actions", async () => {
    const proc = await loadProcFixture("bus-input-devices-laptop.txt")
    const sources = new Map<
      string,
      ReturnType<typeof createControllableEventSource>
    >()
    const actions: KorriInputdActionId[] = []
    await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device => {
        const source = createControllableEventSource()
        sources.set(device.eventNode, source)
        return source.open()
      },
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    sources.get("event3")?.push(evdevKey(KEY_VOLUMEUP, 1))
    sources.get("event3")?.push(evdevKey(KEY_VOLUMEUP, 2))
    sources.get("event3")?.push(evdevKey(KEY_BRIGHTNESSUP, 1))
    sources.get("event3")?.push(evdevKey(KEY_POWER, 1))
    sources.get("event3")?.push(evdevKey(KEY_RECORD, 1))
    sources.get("event5")?.push(evdevEvent(5, SW_LID, 1))
    sources.get("event5")?.push(evdevEvent(5, SW_LID, 0))

    await waitFor(() => actions.length >= 7, "system actions")
    expect(actions.filter(action => action === "volume-up")).toHaveLength(2)
    expect(actions).toContain("brightness-up")
    expect(actions).toContain("power-suspend")
    expect(actions).toContain("screen-switch")
    expect(actions).toContain("lid-closed")
    expect(actions).toContain("lid-opened")
  })

  it("does not dispatch dropped input_sense actions for unrelated key events", async () => {
    const proc = await loadProcFixture("bus-input-devices-odin.txt")
    const source = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event9"
          ? source.open()
          : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    source.push(evdevKey(BTN_A, 1))
    await Bun.sleep(30)

    expect(actions).toEqual([])
  })

  it("dispatches screen-switch from the retained gamepad screen shortcut", async () => {
    const proc = await loadProcFixture("bus-input-devices-odin.txt")
    const source = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event9"
          ? source.open()
          : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    source.push(evdevKey(BTN_TL, 1))
    source.push(evdevKey(BTN_BACK, 1))

    await waitFor(() => actions.includes("screen-switch"), "screen-switch")
    expect(actions).toEqual(["screen-switch"])
  })

  it("opens non-gamepad policy devices without broadcasting them to gamepad subscribers", async () => {
    const proc = await loadProcFixture("bus-input-devices-laptop.txt")
    const sources = new Map<
      string,
      ReturnType<typeof createControllableEventSource>
    >()
    const actions: KorriInputdActionId[] = []
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device => {
        const source = createControllableEventSource()
        sources.set(device.eventNode, source)
        return source.open()
      },
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    await Bun.sleep(30)
    expect(client.messages).toEqual([])

    sources.get("event3")?.push(evdevKey(KEY_VOLUMEUP, 1))
    await waitFor(() => actions.includes("volume-up"), "volume action")
    expect(client.messages).toEqual([])

    client.close()
  })

  it("skips stale proc devices whose event node is missing", async () => {
    const proc = await loadProcFixture("bus-input-devices-odin.txt")
    const opened: string[] = []
    const handle = await startInputd({
      readProcDevices: async () => proc,
      eventNodeExists: eventNode => eventNode !== "event3",
      openEventSource: device => {
        opened.push(device.eventNode)
        return createControllableEventSource().open()
      },
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    const deviceAdded = decodeNativeInputEvent(await client.nextMessage())

    expect(opened).not.toContain("event3")
    expect(deviceAdded).toMatchObject({
      kind: "device-added",
      device: { deviceId: "inputplumber-virtual-xbox360" },
    })

    client.close()
  })

  it("clears chord state when a device is removed", async () => {
    const odin = await loadProcFixture("bus-input-devices-odin.txt")
    let proc = odin
    const source = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event9"
          ? source.open()
          : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    source.push(evdevKey(BTN_TL, 1))
    source.push(evdevKey(BTN_TR, 1))
    source.push(evdevKey(BTN_SELECT, 1))
    await Bun.sleep(20)

    proc = ""
    await handle.refreshDevices()
    proc = odin
    await handle.refreshDevices()
    source.push(evdevKey(BTN_START, 1))
    await Bun.sleep(30)

    expect(actions).toEqual([])
  })
})

function evdevKey(code: number, value: number): Uint8Array {
  return evdevEvent(1, code, value)
}

function evdevEvent(type: number, code: number, value: number): Uint8Array {
  const bytes = new Uint8Array(24)
  const view = new DataView(bytes.buffer)
  view.setBigInt64(0, 1710000000n, true)
  view.setBigInt64(8, 123000n, true)
  view.setUint16(16, type, true)
  view.setUint16(18, code, true)
  view.setInt32(20, value, true)
  return bytes
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
