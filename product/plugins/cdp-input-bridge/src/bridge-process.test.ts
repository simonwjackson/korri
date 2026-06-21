import { describe, expect, it } from "bun:test"
import { EventEmitter } from "node:events"
import {
  type CdpKeyboardEvent,
  createCdpInputTranslator,
  createProcessCdpInputBridge,
  parseEvtestLine,
} from "./bridge-process"
import { YFS_DEFAULT_MAPPING } from "./mapping"

describe("CDP input bridge translation", () => {
  it("parses evtest key and absolute event lines", () => {
    expect(
      parseEvtestLine(
        "Event: time 1.0, type 1 (EV_KEY), code 308 (BTN_WEST), value 1",
      ),
    ).toEqual({ kind: "key", code: "BTN_WEST", value: 1 })
    expect(
      parseEvtestLine(
        "Event: time 1.0, type 3 (EV_ABS), code 0 (ABS_X), value -16000",
      ),
    ).toEqual({ kind: "absolute", code: "ABS_X", value: -16000 })
  })
  it("translates button press/release into CDP key events", async () => {
    const events: CdpKeyboardEvent[] = []
    const translator = createCdpInputTranslator(YFS_DEFAULT_MAPPING, {
      dispatch: async event => {
        events.push(event)
      },
    })

    await translator.handle({ kind: "key", code: "BTN_WEST", value: 1 })
    await translator.handle({ kind: "key", code: "BTN_WEST", value: 0 })

    expect(events).toEqual([
      expect.objectContaining({ type: "rawKeyDown", key: "z", code: "KeyZ" }),
      expect.objectContaining({ type: "keyUp", key: "z", code: "KeyZ" }),
    ])
  })

  it("keeps a shared action pressed until all input sources release it", async () => {
    const events: CdpKeyboardEvent[] = []
    const translator = createCdpInputTranslator(YFS_DEFAULT_MAPPING, {
      dispatch: async event => {
        events.push(event)
      },
    })

    await translator.handle({ kind: "key", code: "BTN_DPAD_LEFT", value: 1 })
    await translator.handle({ kind: "absolute", code: "ABS_X", value: -16000 })
    await translator.handle({ kind: "key", code: "BTN_DPAD_LEFT", value: 0 })
    await translator.handle({ kind: "absolute", code: "ABS_X", value: 0 })

    expect(events.map(event => event.type)).toEqual(["rawKeyDown", "keyUp"])
    expect(events.every(event => event.code === "ArrowLeft")).toBe(true)
  })

  it("translates positive axes and direction switches", async () => {
    const events: CdpKeyboardEvent[] = []
    const translator = createCdpInputTranslator(YFS_DEFAULT_MAPPING, {
      dispatch: async event => {
        events.push(event)
      },
    })

    await translator.handle({ kind: "absolute", code: "ABS_X", value: 16000 })
    await translator.handle({ kind: "absolute", code: "ABS_X", value: -16000 })
    await translator.handle({ kind: "absolute", code: "ABS_X", value: 0 })

    expect(events.map(event => `${event.type}:${event.code}`)).toEqual([
      "rawKeyDown:ArrowRight",
      "keyUp:ArrowRight",
      "rawKeyDown:ArrowLeft",
      "keyUp:ArrowLeft",
    ])
  })

  it("applies analog hysteresis to avoid jitter around neutral", async () => {
    const events: CdpKeyboardEvent[] = []
    const translator = createCdpInputTranslator(YFS_DEFAULT_MAPPING, {
      dispatch: async event => {
        events.push(event)
      },
    })

    await translator.handle({ kind: "absolute", code: "ABS_Y", value: -11999 })
    await translator.handle({ kind: "absolute", code: "ABS_Y", value: -12000 })
    await translator.handle({ kind: "absolute", code: "ABS_Y", value: -9000 })
    await translator.handle({ kind: "absolute", code: "ABS_Y", value: -7999 })

    expect(events.map(event => `${event.type}:${event.code}`)).toEqual([
      "rawKeyDown:ArrowUp",
      "keyUp:ArrowUp",
    ])
  })

  it("releases pressed keys during shutdown", async () => {
    const events: CdpKeyboardEvent[] = []
    const translator = createCdpInputTranslator(YFS_DEFAULT_MAPPING, {
      dispatch: async event => {
        events.push(event)
      },
    })

    await translator.handle({ kind: "key", code: "BTN_SOUTH", value: 1 })
    await translator.releaseAll()

    expect(events.map(event => `${event.type}:${event.code}`)).toEqual([
      "rawKeyDown:KeyA",
      "keyUp:KeyA",
    ])
  })
})

describe("CDP input bridge process manager", () => {
  it("waits for bridge readiness before reporting startup success", async () => {
    const stdout = new EventEmitter()
    const manager = createProcessCdpInputBridge({
      command: "korri-cdp-input-bridge",
      spawn: () => ({
        pid: 123,
        stdout,
        kill: () => true,
        once: () => undefined as never,
      }),
    })

    const started = manager.start({
      launchId: "launch-1",
      devicePath: "/dev/input/event7",
      cdpHost: "127.0.0.1",
      cdpPort: 9333,
      mappingName: "yfs-default",
      watchPid: 456,
      attachTimeoutMs: 5000,
      failClosed: true,
    })
    stdout.emit("data", "korri-cdp-input-bridge: ready\n")

    await expect(started).resolves.toMatchObject({ pid: 123 })
  })

  it("fails startup when the child exits before readiness", async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number
      kill: () => boolean
      once: EventEmitter["once"]
    }
    child.pid = 123
    child.kill = () => true
    child.once = child.once.bind(child)
    const manager = createProcessCdpInputBridge({
      command: "korri-cdp-input-bridge",
      spawn: () => child,
    })

    const started = manager.start({
      launchId: "launch-1",
      devicePath: "/dev/input/event7",
      cdpHost: "127.0.0.1",
      cdpPort: 9333,
      mappingName: "yfs-default",
      attachTimeoutMs: 5000,
      failClosed: true,
    })
    child.emit("exit", 2, null)

    await expect(started).rejects.toThrow(/exited before ready/)
  })

  it("spawns the bridge without ydotoold or uinput arguments and stops it on cleanup", async () => {
    const calls: unknown[] = []
    let killed = false
    const manager = createProcessCdpInputBridge({
      command: "korri-cdp-input-bridge",
      spawn: (command, args) => {
        calls.push({ command, args })
        const stdout = new EventEmitter()
        setTimeout(
          () => stdout.emit("data", "korri-cdp-input-bridge: ready\n"),
          0,
        )
        return {
          pid: 123,
          stdout,
          kill: () => {
            killed = true
            return true
          },
          once: (_event, callback) => {
            setTimeout(() => callback(0, null), 0)
            return undefined as never
          },
        }
      },
    })

    const handle = await manager.start({
      launchId: "launch-1",
      devicePath: "/dev/input/event7",
      cdpHost: "127.0.0.1",
      cdpPort: 9333,
      mappingName: "yfs-default",
      target: { type: "page", urlPattern: "index.html" },
      watchPid: 456,
      attachTimeoutMs: 5000,
      failClosed: true,
    })
    await handle.stop()

    expect(calls).toEqual([
      {
        command: "korri-cdp-input-bridge",
        args: expect.arrayContaining([
          "--device",
          "/dev/input/event7",
          "--cdp-host",
          "127.0.0.1",
          "--cdp-port",
          "9333",
          "--axis-press-threshold",
          "12000",
          "--axis-release-threshold",
          "8000",
          "--watch-pid",
          "456",
        ]),
      },
    ])
    expect(JSON.stringify(calls)).not.toMatch(/ydotoold|uinput/)
    expect(killed).toBe(true)
  })
})
