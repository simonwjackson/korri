import { afterEach, describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { decodeNativeInputEvent } from "@shared/input/native/wire-schema"
import { type InputBridgeHandle, startInputBridge } from "./input-bridge"

const PROC_FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/proc")
const EVDEV_FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/evdev")

const handles: InputBridgeHandle[] = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map(handle => handle.stop()))
})

async function loadProcFixture(name: string): Promise<string> {
  return readFile(join(PROC_FIXTURES_DIR, name), "utf8")
}

function loadEvdevFixture(name: string): Uint8Array {
  return readFileSync(join(EVDEV_FIXTURES_DIR, name))
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

async function startBridge(options: Parameters<typeof startInputBridge>[0]) {
  const handle = await startInputBridge({
    port: 0,
    pollIntervalMs: 10_000,
    logger: silentLogger,
    ...options,
  })
  handles.push(handle)
  return handle
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
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

describe("input bridge", () => {
  it("sends current gamepad devices and streamed input events to gamepad subscribers", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const source = createControllableEventSource()
    const handle = await startBridge({
      readProcDevices: async () => proc,
      openEventSource: () => source.open(),
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))

    const deviceAdded = decodeNativeInputEvent(await client.nextMessage())
    expect(deviceAdded.kind).toBe("device-added")
    expect(
      deviceAdded.kind === "device-added" && deviceAdded.device,
    ).toMatchObject({
      deviceId: "inputplumber-virtual-xbox360",
      class: "gamepad",
      name: "InputPlumber Virtual Xbox 360 Controller",
    })

    source.push(loadEvdevFixture("xbox-press-a.bin"))

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
      code: 304,
      value: 1,
      timestamp: 1710000000123,
    })

    client.close()
  })

  it("sends current devices to clients that subscribe after startup", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const handle = await startBridge({
      readProcDevices: async () => proc,
      openEventSource: () => createControllableEventSource().open(),
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))

    const message = decodeNativeInputEvent(await client.nextMessage())
    expect(message.kind).toBe("device-added")

    client.close()
  })

  it("emits nothing for an empty class subscription", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const handle = await startBridge({
      readProcDevices: async () => proc,
      openEventSource: () => createControllableEventSource().open(),
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: [] }))
    await Bun.sleep(30)

    expect(client.messages).toEqual([])
    client.close()
  })

  it("emits keyboard device-added events without opening keyboard streams", async () => {
    const proc = await loadProcFixture("bus-input-devices-laptop.txt")
    const openedNodes: string[] = []
    const handle = await startBridge({
      readProcDevices: async () => proc,
      openEventSource: device => {
        openedNodes.push(device.eventNode)
        return createControllableEventSource().open()
      },
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["keyboard"] }))

    const message = decodeNativeInputEvent(await client.nextMessage())
    expect(message).toMatchObject({
      kind: "device-added",
      device: { class: "keyboard", name: "USB Keyboard" },
    })
    expect(openedNodes).toEqual([])

    client.close()
  })

  it("keeps malformed subscription connections open until a valid subscription arrives", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const handle = await startBridge({
      readProcDevices: async () => proc,
      openEventSource: () => createControllableEventSource().open(),
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send("not-json")
    await Bun.sleep(30)
    expect(client.ws.readyState).toBe(WebSocket.OPEN)
    expect(client.messages).toEqual([])

    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    const message = decodeNativeInputEvent(await client.nextMessage())
    expect(message.kind).toBe("device-added")

    client.close()
  })

  it("reopens gamepad streams that end while the device remains present", async () => {
    const proc = (await loadProcFixture("bus-input-devices-device.txt"))
      .split(/\n\s*\n/)
      .find(block =>
        block.includes("InputPlumber Virtual Xbox 360 Controller"),
      ) as string
    const sources: ReturnType<typeof createControllableEventSource>[] = []
    const handle = await startBridge({
      readProcDevices: async () => proc,
      openEventSource: () => {
        const source = createControllableEventSource()
        sources.push(source)
        return source.open()
      },
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    await client.nextMessage()

    sources[0]?.push(loadEvdevFixture("xbox-press-a.bin"))
    await waitFor(() => client.messages.length >= 2, "first input event")
    sources[0]?.close()
    await waitFor(() => sources.length >= 2, "stream reopen")

    sources[1]?.push(loadEvdevFixture("xbox-press-a.bin"))
    await waitFor(() => client.messages.length >= 3, "second input event")

    const inputEvents = client.messages
      .map(message => decodeNativeInputEvent(message))
      .filter(message => message.kind === "input")
    expect(inputEvents).toHaveLength(2)

    client.close()
  })

  it("reopens gamepad streams when the same device id moves to a new event node", async () => {
    let proc = `
I: Bus=0003 Vendor=045e Product=028e Version=0114
N: Name="InputPlumber Virtual Xbox 360 Controller"
P: Phys=inputplumber/virtual-xbox360
S: Sysfs=/devices/virtual/input/input9
U: Uniq=inputplumber-virtual-xbox360
H: Handlers=event9
B: EV=20001b
B: KEY=1000000000000 0 0 0 0
B: ABS=30027
`
    const openedNodes: string[] = []
    const sources: ReturnType<typeof createControllableEventSource>[] = []
    const handle = await startBridge({
      readProcDevices: async () => proc,
      openEventSource: device => {
        openedNodes.push(device.eventNode)
        const source = createControllableEventSource()
        sources.push(source)
        return source.open()
      },
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    await client.nextMessage()

    proc = proc.replace("event9", "event12")
    await handle.refreshDevices()

    await waitFor(
      () => openedNodes.includes("event12"),
      "new event node stream",
    )
    sources[1]?.push(loadEvdevFixture("xbox-press-a.bin"))
    await waitFor(
      () =>
        client.messages
          .map(message => decodeNativeInputEvent(message))
          .some(message => message.kind === "input"),
      "input event from moved event node",
    )

    expect(openedNodes).toEqual(["event9", "event12"])

    client.close()
  })

  it("emits device-removed and device-added during proc refreshes", async () => {
    const device = await loadProcFixture("bus-input-devices-device.txt")
    const laptop = await loadProcFixture("bus-input-devices-laptop.txt")
    let proc = device
    const handle = await startBridge({
      readProcDevices: async () => proc,
      openEventSource: () => createControllableEventSource().open(),
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad", "keyboard"] }))
    await waitFor(
      () =>
        client.messages
          .map(message => decodeNativeInputEvent(message))
          .filter(message => message.kind === "device-added").length >= 2,
      "initial device-added messages",
    )
    client.messages.length = 0

    proc = laptop
    await handle.refreshDevices()

    await waitFor(
      () =>
        client.messages
          .map(message => decodeNativeInputEvent(message))
          .some(
            message =>
              message.kind === "device-added" &&
              message.device.class === "keyboard",
          ),
      "hot-plug messages",
    )
    const messages = client.messages.map(message =>
      decodeNativeInputEvent(message),
    )
    expect(
      messages.some(
        message =>
          message.kind === "device-removed" &&
          message.deviceId === "inputplumber-virtual-xbox360",
      ),
    ).toBe(true)
    const keyboard = messages.find(
      message =>
        message.kind === "device-added" && message.device.class === "keyboard",
    )
    expect(keyboard).toMatchObject({
      kind: "device-added",
      device: {
        deviceId: "usb-0000:00:14.0-1/input0",
        class: "keyboard",
        name: "USB Keyboard",
        capabilities: ["EV_KEY", "KEY_A"],
      },
    })

    client.close()
  })
})
