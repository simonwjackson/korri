import { afterEach, describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  ABS_HAT0X,
  ABS_HAT0Y,
  ABS_X,
  BTN_A,
  BTN_BACK,
  BTN_MODE,
  BTN_SELECT,
  BTN_START,
  BTN_THUMBL,
  BTN_THUMBR,
  BTN_TL,
  BTN_TR,
  KEY_BRIGHTNESSUP,
  KEY_F24,
  KEY_POWER,
  KEY_RECORD,
  KEY_VOLUMEDOWN,
  KEY_VOLUMEUP,
  SW_LID,
} from "@platform/input/native/button-codes"
import { decodeNativeInputEvent } from "@platform/input/native/wire-schema"
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

function aButtonValues(messages: readonly unknown[]): number[] {
  return messages.flatMap(message => {
    const event = decodeNativeInputEvent(message)
    return event.kind === "input" && event.code === BTN_A ? [event.value] : []
  })
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
    const proc = await loadProcFixture("bus-input-devices-device.txt")
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

  it("includes gamepad axis metadata in device-added frames", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: () => createControllableEventSource().open(),
      readAxisInfo: async device =>
        device.eventNode === "event9"
          ? [{ code: ABS_X, minimum: -1_408, maximum: 1_408, flat: 0 }]
          : [],
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))

    const deviceAdded = decodeNativeInputEvent(await client.nextMessage())
    expect(deviceAdded).toMatchObject({
      kind: "device-added",
      device: {
        deviceId: "inputplumber-virtual-xbox360",
        axes: [{ code: ABS_X, minimum: -1_408, maximum: 1_408, flat: 0 }],
      },
    })

    client.close()
  })

  it("keeps devices discoverable when axis metadata cannot be read", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const warnings: string[] = []
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: () => createControllableEventSource().open(),
      readAxisInfo: async device => {
        if (device.eventNode === "event9") throw new Error("ioctl failed")
        return []
      },
      logger: {
        ...silentLogger,
        warn: (_input, message) => warnings.push(message ?? ""),
      },
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))

    const deviceAdded = decodeNativeInputEvent(await client.nextMessage())
    expect(deviceAdded).toMatchObject({
      kind: "device-added",
      device: { deviceId: "inputplumber-virtual-xbox360" },
    })
    if (deviceAdded.kind === "device-added") {
      expect(deviceAdded.device.axes).toBeUndefined()
    }
    expect(warnings).toContain("inputd: failed to read axis metadata")

    client.close()
  })

  it("does not read axis metadata for devices without EV_ABS", async () => {
    const proc = `
I: Bus=0019 Vendor=0000 Product=0000 Version=0000
N: Name="Keyboard Without Absolute Axes"
P: Phys=keyboard/no-abs
S: Sysfs=/devices/virtual/input/input11
U: Uniq=
H: Handlers=event11
B: KEY=40000000
`
    const axisReads: string[] = []
    await startInputd({
      readProcDevices: async () => proc,
      openEventSource: () => createControllableEventSource().open(),
      readAxisInfo: async device => {
        axisReads.push(device.eventNode)
        return []
      },
    })

    expect(axisReads).toEqual([])
  })

  it("requires the InputPlumber virtual gamepad as the standard gamepad path", async () => {
    const proc = await loadProcFixture(
      "bus-input-devices-inputplumber-virtual.txt",
    )
    const opened: string[] = []
    const virtualSource = createControllableEventSource()
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device => {
        opened.push(device.eventNode)
        return device.eventNode === "event10"
          ? virtualSource.open()
          : createControllableEventSource().open()
      },
    })

    expect(opened).toContain("event10")
    expect(opened).not.toContain("event3")

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))

    const deviceAdded = decodeNativeInputEvent(await client.nextMessage())
    expect(deviceAdded).toMatchObject({
      kind: "device-added",
      device: { deviceId: "inputplumber-virtual-xbox360" },
    })

    virtualSource.push(evdevKey(BTN_A, 1))
    await waitFor(() => aButtonValues(client.messages).includes(1), "A input")
    expect(aButtonValues(client.messages)).toEqual([1])

    client.close()
  })

  it("does not substitute raw gamepads when no InputPlumber target exists", async () => {
    const proc = await loadProcFixture(
      "bus-input-devices-inputplumber-raw-only.txt",
    )
    const opened: string[] = []
    const warnings: string[] = []
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device => {
        opened.push(device.eventNode)
        return createControllableEventSource().open()
      },
      logger: {
        ...silentLogger,
        warn: (_input, message) => warnings.push(message ?? ""),
      },
    })

    expect(opened).toEqual([])
    expect(warnings).toContain(
      "inputd: normalized InputPlumber gamepad unavailable",
    )

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    await Bun.sleep(30)
    expect(client.messages).toEqual([])

    client.close()
  })

  it("ignores the retired env toggle and still requires InputPlumber", async () => {
    const previous = process.env.KORRI_INPUTD_REQUIRE_INPUTPLUMBER_GAMEPAD
    process.env.KORRI_INPUTD_REQUIRE_INPUTPLUMBER_GAMEPAD = "0"
    try {
      const proc = await loadProcFixture(
        "bus-input-devices-inputplumber-raw-only.txt",
      )
      const opened: string[] = []
      const warnings: string[] = []
      const handle = await startInputd({
        readProcDevices: async () => proc,
        openEventSource: device => {
          opened.push(device.eventNode)
          return createControllableEventSource().open()
        },
        logger: {
          ...silentLogger,
          warn: (_input, message) => warnings.push(message ?? ""),
        },
      })

      expect(opened).toEqual([])
      expect(warnings).toContain(
        "inputd: normalized InputPlumber gamepad unavailable",
      )

      const client = connectClient(handle.port)
      await client.open()
      client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
      await Bun.sleep(30)
      expect(client.messages).toEqual([])
      client.close()
    } finally {
      if (previous === undefined) {
        delete process.env.KORRI_INPUTD_REQUIRE_INPUTPLUMBER_GAMEPAD
      } else {
        process.env.KORRI_INPUTD_REQUIRE_INPUTPLUMBER_GAMEPAD = previous
      }
    }
  })

  it("sends device-added before input frames for newly discovered devices", async () => {
    const emptyProc = ""
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    let currentProc = emptyProc
    const source = createControllableEventSource()
    const handle = await startInputd({
      readProcDevices: async () => currentProc,
      openEventSource: device => {
        if (device.eventNode !== "event9") {
          return createControllableEventSource().open()
        }
        const opened = source.open()
        setTimeout(() => source.push(evdevKey(BTN_A, 1)), 0)
        return opened
      },
      readAxisInfo: async device =>
        device.eventNode === "event9"
          ? [{ code: ABS_X, minimum: -1_408, maximum: 1_408, flat: 0 }]
          : [],
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    await Bun.sleep(10)
    currentProc = proc
    await handle.refreshDevices()

    await waitFor(
      () =>
        client.messages
          .map(message => decodeNativeInputEvent(message))
          .some(message => message.kind === "input"),
      "device then input",
    )
    const decoded = client.messages.map(message =>
      decodeNativeInputEvent(message),
    )
    const firstInputIndex = decoded.findIndex(
      message => message.kind === "input",
    )
    const targetDeviceAddedIndex = decoded.findIndex(
      message =>
        message.kind === "device-added" &&
        message.device.deviceId === "inputplumber-virtual-xbox360",
    )
    expect(targetDeviceAddedIndex).toBeGreaterThanOrEqual(0)
    expect(firstInputIndex).toBeGreaterThan(targetDeviceAddedIndex)

    client.close()
  })

  it("dispatches L1+R1+Start+Select kill once after the hold threshold", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const systemSource = createControllableEventSource()
    const gamepadSource = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    const timers = createFakeHoldTimers()
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event6"
          ? systemSource.open()
          : device.eventNode === "event9"
            ? gamepadSource.open()
            : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
      killHoldMs: 2_000,
      holdTimers: timers,
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    await client.nextMessage()

    gamepadSource.push(evdevKey(BTN_TL, 1))
    gamepadSource.push(evdevKey(BTN_TR, 1))
    gamepadSource.push(evdevKey(BTN_START, 1))
    gamepadSource.push(evdevKey(BTN_SELECT, 1))
    gamepadSource.push(evdevKey(BTN_SELECT, 2))

    // The chord engages the hold but must NOT fire instantly.
    await waitFor(() => timers.pending() > 0, "chord engaged")
    expect(actions).toEqual([])

    // Holding past the threshold fires exactly one kill.
    timers.advance(2_000)
    await waitFor(() => actions.length === 1, "kill after hold")
    expect(actions).toEqual(["kill-current-game"])

    await Bun.sleep(30)
    const inputs = client.messages
      .map(message => decodeNativeInputEvent(message))
      .filter(message => message.kind === "input")
    expect(inputs.map(input => input.code)).not.toContain(BTN_START)
    expect(inputs.map(input => input.code)).not.toContain(BTN_SELECT)

    client.close()
  })

  it("does not kill when the chord is released before the hold threshold", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const gamepadSource = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    const timers = createFakeHoldTimers()
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event9"
          ? gamepadSource.open()
          : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
      killHoldMs: 2_000,
      holdTimers: timers,
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    await client.nextMessage()

    gamepadSource.push(evdevKey(BTN_TL, 1))
    gamepadSource.push(evdevKey(BTN_TR, 1))
    gamepadSource.push(evdevKey(BTN_START, 1))
    gamepadSource.push(evdevKey(BTN_SELECT, 1))
    await waitFor(() => timers.pending() > 0, "chord engaged")

    // Release a chord control before the threshold: this is a tap, not a kill.
    timers.advance(500)
    gamepadSource.push(evdevKey(BTN_SELECT, 0))
    await waitFor(() => timers.pending() === 0, "hold released")

    // Even as more time passes, nothing fires.
    timers.advance(5_000)
    await Bun.sleep(30)
    expect(actions).toEqual([])

    client.close()
  })

  it("does not leak Start as menu while a kill shortcut chord is in progress", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
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
    await client.nextMessage()

    source.push(evdevKey(BTN_TL, 1))
    source.push(evdevKey(BTN_TR, 1))
    source.push(evdevKey(BTN_START, 1))

    await Bun.sleep(30)
    const inputs = client.messages
      .map(message => decodeNativeInputEvent(message))
      .filter(message => message.kind === "input")
    expect(inputs.map(input => input.code)).not.toContain(BTN_START)

    client.close()
  })

  it("does not keep L3+R3+Start as a session toggle shortcut", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
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

    source.push(evdevKey(BTN_THUMBL, 1))
    source.push(evdevKey(BTN_THUMBR, 1))
    source.push(evdevKey(BTN_START, 1))
    await Bun.sleep(30)

    expect(actions).toEqual([])
  })

  it("dispatches plain gamepad Home as a panel action", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
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

    source.push(evdevKey(BTN_MODE, 1))
    source.push(evdevKey(BTN_MODE, 0))

    await waitFor(() => actions.includes("system-panel"), "home panel")
    expect(actions).toEqual(["system-panel"])
  })

  it("does not treat AYN/F24 as Home by default", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const source = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event6"
          ? source.open()
          : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    source.push(evdevKey(KEY_F24, 1))
    source.push(evdevKey(KEY_F24, 0))
    await Bun.sleep(30)

    expect(actions).toEqual([])
  })

  it("routes AYN/F24 to the configured platform action", async () => {
    const previous = process.env.KORRI_INPUTD_KEY_F24_ACTION
    process.env.KORRI_INPUTD_KEY_F24_ACTION = "toggle-bottom-screen"
    try {
      const proc = await loadProcFixture("bus-input-devices-device.txt")
      const source = createControllableEventSource()
      const actions: KorriInputdActionId[] = []
      await startInputd({
        readProcDevices: async () => proc,
        openEventSource: device =>
          device.eventNode === "event6"
            ? source.open()
            : createControllableEventSource().open(),
        actionDispatcher: {
          dispatch: async actionId => {
            actions.push(actionId)
          },
        },
      })

      source.push(evdevKey(KEY_F24, 1))
      source.push(evdevKey(KEY_F24, 2))
      source.push(evdevKey(KEY_F24, 0))

      await waitFor(
        () => actions.includes("toggle-bottom-screen"),
        "AYN action",
      )
      expect(actions).toEqual(["toggle-bottom-screen"])
    } finally {
      if (previous === undefined) {
        delete process.env.KORRI_INPUTD_KEY_F24_ACTION
      } else {
        process.env.KORRI_INPUTD_KEY_F24_ACTION = previous
      }
    }
  })

  it("suppresses Home+D-pad shortcut frames from gamepad subscribers", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const systemSource = createControllableEventSource()
    const gamepadSource = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event6"
          ? systemSource.open()
          : device.eventNode === "event9"
            ? gamepadSource.open()
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

    systemSource.push(evdevKey(BTN_MODE, 1))
    gamepadSource.push(evdevEvent(3, ABS_HAT0X, -1))
    gamepadSource.push(evdevEvent(3, ABS_HAT0X, 0))

    await waitFor(() => actions.includes("workspace-prev"), "workspace-prev")
    await Bun.sleep(30)

    expect(
      client.messages
        .map(message => decodeNativeInputEvent(message))
        .filter(message => message.kind === "input")
        .map(input => input.value),
    ).toEqual([0])

    client.close()
  })

  it("streams release frames while Home is held so subscribers clear button state", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const systemSource = createControllableEventSource()
    const gamepadSource = createControllableEventSource()
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event6"
          ? systemSource.open()
          : device.eventNode === "event9"
            ? gamepadSource.open()
            : createControllableEventSource().open(),
    })

    const client = connectClient(handle.port)
    await client.open()
    client.ws.send(JSON.stringify({ classes: ["gamepad"] }))
    await client.nextMessage()

    gamepadSource.push(evdevKey(BTN_A, 1))
    systemSource.push(evdevKey(BTN_MODE, 1))
    gamepadSource.push(evdevKey(BTN_A, 0))
    systemSource.push(evdevKey(BTN_MODE, 0))
    gamepadSource.push(evdevKey(BTN_A, 1))

    await waitFor(
      () => aButtonValues(client.messages).length === 3,
      "A down/up/down frames",
    )

    expect(aButtonValues(client.messages)).toEqual([1, 0, 1])

    client.close()
  })

  it("routes Home+D-pad and Home+shoulder to Sway workspace and output actions", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const systemSource = createControllableEventSource()
    const gamepadSource = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event6"
          ? systemSource.open()
          : device.eventNode === "event9"
            ? gamepadSource.open()
            : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    systemSource.push(evdevKey(BTN_MODE, 1))
    gamepadSource.push(evdevEvent(3, ABS_HAT0X, -1))
    gamepadSource.push(evdevEvent(3, ABS_HAT0X, 0))
    gamepadSource.push(evdevEvent(3, ABS_HAT0X, 1))
    gamepadSource.push(evdevEvent(3, ABS_HAT0X, 0))
    gamepadSource.push(evdevKey(BTN_TL, 1))
    gamepadSource.push(evdevKey(BTN_TL, 0))
    gamepadSource.push(evdevKey(BTN_TR, 1))
    gamepadSource.push(evdevKey(BTN_TR, 0))
    gamepadSource.push(evdevEvent(3, ABS_HAT0Y, -1))
    gamepadSource.push(evdevEvent(3, ABS_HAT0Y, 0))
    gamepadSource.push(evdevEvent(3, ABS_HAT0Y, 1))

    await waitFor(() => actions.length === 6, "sway actions")
    expect(actions).toEqual([
      "workspace-prev",
      "workspace-next",
      "workspace-prev",
      "workspace-next",
      "move-output-up",
      "move-output-down",
    ])
  })

  it("maps Home+Volume to brightness while preserving Volume alone", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const source = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event6"
          ? source.open()
          : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    source.push(evdevKey(KEY_VOLUMEUP, 1))
    source.push(evdevKey(KEY_VOLUMEUP, 0))
    source.push(evdevKey(BTN_MODE, 1))
    source.push(evdevKey(KEY_VOLUMEUP, 1))
    source.push(evdevKey(KEY_VOLUMEUP, 0))
    source.push(evdevKey(KEY_VOLUMEDOWN, 1))

    await waitFor(() => actions.length === 3, "volume/brightness actions")
    expect(actions).toEqual(["volume-up", "brightness-up", "brightness-down"])
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
    const proc = await loadProcFixture("bus-input-devices-device.txt")
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

  it("dispatches screen power toggles from Home+stick clicks", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const systemSource = createControllableEventSource()
    const gamepadSource = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event6"
          ? systemSource.open()
          : device.eventNode === "event9"
            ? gamepadSource.open()
            : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    systemSource.push(evdevKey(BTN_MODE, 1))
    gamepadSource.push(evdevKey(BTN_THUMBL, 1))
    gamepadSource.push(evdevKey(BTN_THUMBL, 0))
    systemSource.push(evdevKey(BTN_MODE, 0))
    systemSource.push(evdevKey(BTN_MODE, 1))
    gamepadSource.push(evdevKey(BTN_THUMBR, 1))

    await waitFor(() => actions.length === 2, "screen power toggles")
    expect(actions).toEqual(["toggle-bottom-screen", "toggle-top-screen"])
  })

  it("dispatches screen-switch from Home+Back", async () => {
    const proc = await loadProcFixture("bus-input-devices-device.txt")
    const systemSource = createControllableEventSource()
    const gamepadSource = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event6"
          ? systemSource.open()
          : device.eventNode === "event9"
            ? gamepadSource.open()
            : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    systemSource.push(evdevKey(BTN_MODE, 1))
    gamepadSource.push(evdevKey(BTN_BACK, 1))

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
    const proc = await loadProcFixture("bus-input-devices-device.txt")
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

  it("clears shortcut state when a device is removed", async () => {
    const device = await loadProcFixture("bus-input-devices-device.txt")
    let proc = device
    const systemSource = createControllableEventSource()
    const gamepadSource = createControllableEventSource()
    const actions: KorriInputdActionId[] = []
    const handle = await startInputd({
      readProcDevices: async () => proc,
      openEventSource: device =>
        device.eventNode === "event6"
          ? systemSource.open()
          : device.eventNode === "event9"
            ? gamepadSource.open()
            : createControllableEventSource().open(),
      actionDispatcher: {
        dispatch: async actionId => {
          actions.push(actionId)
        },
      },
    })

    systemSource.push(evdevKey(BTN_MODE, 1))
    await Bun.sleep(20)

    proc = ""
    await handle.refreshDevices()
    proc = device
    await handle.refreshDevices()
    gamepadSource.push(evdevKey(BTN_TL, 1))
    gamepadSource.push(evdevKey(BTN_TR, 1))
    await Bun.sleep(30)

    expect(actions).toEqual([])
  })
})

function evdevKey(code: number, value: number): Uint8Array {
  return evdevEvent(1, code, value)
}

interface FakeHoldTimers {
  now: () => number
  setInterval: (callback: () => void, ms: number) => unknown
  clearInterval: (handle: unknown) => void
  pending: () => number
  advance: (ms: number) => void
}

function createFakeHoldTimers(): FakeHoldTimers {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { cb: () => void; ms: number; next: number }>()
  return {
    now: () => now,
    setInterval(cb, ms) {
      const id = nextId++
      timers.set(id, { cb, ms, next: now + ms })
      return id
    },
    clearInterval(handle) {
      timers.delete(handle as number)
    },
    pending: () => timers.size,
    advance(ms) {
      const target = now + ms
      for (;;) {
        let due = Number.POSITIVE_INFINITY
        let dueId = -1
        for (const [id, timer] of timers) {
          if (timer.next < due) {
            due = timer.next
            dueId = id
          }
        }
        if (dueId === -1 || due > target) break
        now = due
        const timer = timers.get(dueId)
        if (!timer) continue
        timer.next = now + timer.ms
        timer.cb()
      }
      now = target
    },
  }
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
