import { describe, expect, it } from "bun:test"
import {
  createCdpInputTranslator,
  createProcessCdpInputBridge,
  type CdpKeyboardEvent,
} from "./bridge-process"
import { YFS_DEFAULT_MAPPING } from "./mapping"

describe("CDP input bridge translation", () => {
  it("translates button press/release into CDP key events", async () => {
    const events: CdpKeyboardEvent[] = []
    const translator = createCdpInputTranslator(YFS_DEFAULT_MAPPING, {
      dispatch: async event => events.push(event),
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
      dispatch: async event => events.push(event),
    })

    await translator.handle({ kind: "key", code: "BTN_DPAD_LEFT", value: 1 })
    await translator.handle({ kind: "absolute", code: "ABS_X", value: -16000 })
    await translator.handle({ kind: "key", code: "BTN_DPAD_LEFT", value: 0 })
    await translator.handle({ kind: "absolute", code: "ABS_X", value: 0 })

    expect(events.map(event => event.type)).toEqual(["rawKeyDown", "keyUp"])
    expect(events.every(event => event.code === "ArrowLeft")).toBe(true)
  })

  it("applies analog hysteresis to avoid jitter around neutral", async () => {
    const events: CdpKeyboardEvent[] = []
    const translator = createCdpInputTranslator(YFS_DEFAULT_MAPPING, {
      dispatch: async event => events.push(event),
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
      dispatch: async event => events.push(event),
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
  it("spawns the bridge without ydotoold or uinput arguments and stops it on cleanup", async () => {
    const calls: unknown[] = []
    let killed = false
    const manager = createProcessCdpInputBridge({
      command: "korri-cdp-input-bridge",
      spawn: (command, args) => {
        calls.push({ command, args })
        return {
          pid: 123,
          kill: () => {
            killed = true
            return true
          },
          once: (_event, callback) => {
            setTimeout(() => callback(0, null), 0)
            return undefined
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
          "--watch-pid",
          "456",
        ]),
      },
    ])
    expect(JSON.stringify(calls)).not.toMatch(/ydotoold|uinput/)
    expect(killed).toBe(true)
  })
})
