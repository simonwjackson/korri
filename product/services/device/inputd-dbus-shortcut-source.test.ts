import { describe, expect, it } from "bun:test"
import { BTN_MODE, BTN_TL, EV_KEY } from "@platform/input/native/button-codes"
import {
  DEFAULT_DBUS_TARGET_PATH,
  startDbusShortcutSource,
} from "./inputd-dbus-shortcut-source"
import type { ShortcutEvdevEvent } from "./inputd-dbus-shortcuts"

function harness() {
  const events: ShortcutEvdevEvent[] = []
  let captured: ((line: string) => void) | null = null
  let stopped = false
  let spawnCommand = ""
  let spawnArgs: readonly string[] = []
  const source = startDbusShortcutSource({
    spawnLines: (command, args, onLine) => {
      spawnCommand = command
      spawnArgs = args
      captured = onLine
      return () => {
        stopped = true
      }
    },
    onShortcutEvent: event => events.push(event),
  })
  return {
    events,
    source,
    emit: (line: string) => captured?.(line),
    get spawnCommand() {
      return spawnCommand
    },
    get spawnArgs() {
      return spawnArgs
    },
    get stopped() {
      return stopped
    },
  }
}

const line = (cap: string, value: string) =>
  `/org/shadowblip/InputPlumber/devices/target/dbus0: org.shadowblip.Input.DBusDevice.InputEvent ('${cap}', ${value})`

describe("startDbusShortcutSource", () => {
  it("monitors the default DBus target path via gdbus", () => {
    const h = harness()
    expect(h.spawnArgs).toContain("monitor")
    expect(h.spawnArgs).toContain(DEFAULT_DBUS_TARGET_PATH)
  })

  it("line-buffers the monitor with stdbuf -oL so events arrive immediately", () => {
    // gdbus block-buffers a piped stdout; without stdbuf -oL inputd receives
    // ui_* events in delayed batches and chords never fire in time.
    const h = harness()
    expect(h.spawnCommand).toBe("stdbuf")
    expect(h.spawnArgs[0]).toBe("-oL")
    expect(h.spawnArgs[1]).toBe("gdbus")
    // -oL must precede gdbus so it applies to the gdbus process.
    expect(h.spawnArgs.indexOf("-oL")).toBeLessThan(
      h.spawnArgs.indexOf("gdbus"),
    )
  })

  it("maps InputEvent signals to shortcut events for the engine", () => {
    const h = harness()
    h.emit(line("ui_guide", "1.0"))
    h.emit(line("ui_l1", "1.0"))
    h.emit(line("ui_l1", "0.0"))
    expect(h.events).toEqual([
      { type: EV_KEY, code: BTN_MODE, value: 1 },
      { type: EV_KEY, code: BTN_TL, value: 1 },
      { type: EV_KEY, code: BTN_TL, value: 0 },
    ])
  })

  it("ignores unrelated monitor lines and non-shortcut capabilities", () => {
    const h = harness()
    h.emit("Monitoring signals on object /org/.../dbus0 ...")
    h.emit(line("ui_quick", "1.0"))
    h.emit(line("ui_touch", "1.0"))
    expect(h.events).toEqual([])
  })

  it("close() terminates the monitor subprocess", () => {
    const h = harness()
    h.source.close()
    expect(h.stopped).toBe(true)
  })
})
