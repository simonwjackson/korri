import { describe, expect, it } from "bun:test"
import {
  createLiveInterceptPort,
  parseInputEventLine,
  type InterceptSubprocess,
} from "./overlay-intercept-live"

describe("parseInputEventLine", () => {
  it("parses a dbus0 InputEvent press", () => {
    const line =
      "/org/shadowblip/InputPlumber/devices/target/dbus0: org.shadowblip.Input.DBusDevice.InputEvent ('ui_left', 1.0)"
    expect(parseInputEventLine(line)).toEqual({
      capability: "ui_left",
      value: 1,
    })
  })

  it("parses a release (0.0)", () => {
    expect(parseInputEventLine("... InputEvent ('ui_accept', 0.0)")).toEqual({
      capability: "ui_accept",
      value: 0,
    })
  })

  it("returns null for unrelated lines", () => {
    expect(parseInputEventLine("Monitoring signals from ...")).toBeNull()
    expect(
      parseInputEventLine("... PropertiesChanged ('...', {...})"),
    ).toBeNull()
  })
})

describe("createLiveInterceptPort", () => {
  function fakeSubprocess() {
    const runs: Array<{ command: string; args: readonly string[] }> = []
    let lineSink: ((line: string) => void) | null = null
    let stopped = false
    const subprocess: InterceptSubprocess = {
      async run(command, args) {
        runs.push({ command, args })
      },
      spawnLines(_command, _args, onLine) {
        lineSink = onLine
        return () => {
          stopped = true
          lineSink = null
        }
      },
    }
    return {
      subprocess,
      runs,
      emit: (line: string) => lineSink?.(line),
      isStopped: () => stopped,
    }
  }

  it("sets InterceptMode via busctl set-property", async () => {
    const fake = fakeSubprocess()
    const port = createLiveInterceptPort({ subprocess: fake.subprocess })
    await port.setInterceptMode(2)
    expect(fake.runs).toHaveLength(1)
    expect(fake.runs[0].command).toBe("busctl")
    expect(fake.runs[0].args).toEqual([
      "--system",
      "set-property",
      "org.shadowblip.InputPlumber",
      "/org/shadowblip/InputPlumber/CompositeDevice0",
      "org.shadowblip.Input.CompositeDevice",
      "InterceptMode",
      "u",
      "2",
    ])
  })

  it("delivers parsed ui_* events from the monitor and stops on unsubscribe", () => {
    const fake = fakeSubprocess()
    const port = createLiveInterceptPort({ subprocess: fake.subprocess })
    const events: Array<[string, number]> = []
    const stop = port.subscribeInputEvents((cap, val) =>
      events.push([cap, val]),
    )
    fake.emit("... InputEvent ('ui_right', 1.0)")
    fake.emit("noise")
    fake.emit("... InputEvent ('ui_back', 0.0)")
    stop()
    expect(events).toEqual([
      ["ui_right", 1],
      ["ui_back", 0],
    ])
    expect(fake.isStopped()).toBe(true)
  })
})
