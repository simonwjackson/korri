/**
 * Persistent InputPlumber DBus-target reader that feeds the system shortcut
 * engine grab-immune input.
 *
 * A′: the Korri InputPlumber profile routes the shortcut buttons to the DBus
 * target (Home to DBus only; shoulders/sticks/d-pad to gamepad AND DBus). This
 * source monitors that target's `InputEvent('ui_*', value)` signals, maps them
 * to the synthetic evdev events the shortcut engine already understands, and
 * hands them off. Because a D-Bus signal channel cannot be `EVIOCGRAB`'d, the
 * chords survive a foreground game grabbing the virtual pad.
 *
 * The chord engine dedupes via its fired-shortcut set, and the only tap-bearing
 * controls (Home, Back) are single-sourced, so running this alongside the raw
 * evdev path double-fires nothing.
 *
 * The subprocess wiring is a thin adapter; parsing/mapping is delegated to
 * pure, unit-tested helpers.
 */
import {
  dbusCapabilityToShortcutEvent,
  type ShortcutEvdevEvent,
} from "./inputd-dbus-shortcuts"
import { parseInputEventLine } from "./overlay-intercept-live"

const BUS_NAME = "org.shadowblip.InputPlumber"

/** First DBus target path InputPlumber creates when `dbus` is a target. */
export const DEFAULT_DBUS_TARGET_PATH =
  "/org/shadowblip/InputPlumber/devices/target/dbus0"

export interface DbusShortcutSourceDeps {
  /**
   * Spawn a long-running command and deliver stdout line by line; returns a
   * stop() that terminates it. Reuses the intercept subprocess adapter.
   */
  readonly spawnLines: (
    command: string,
    args: readonly string[],
    onLine: (line: string) => void,
  ) => () => void
  /** Feed a mapped shortcut event into the engine + dispatch. */
  readonly onShortcutEvent: (event: ShortcutEvdevEvent) => void
  readonly gdbus?: string
  readonly objectPath?: string
}

export interface DbusShortcutSource {
  readonly close: () => void
}

export function startDbusShortcutSource(
  deps: DbusShortcutSourceDeps,
): DbusShortcutSource {
  const gdbus = deps.gdbus ?? "gdbus"
  const objectPath = deps.objectPath ?? DEFAULT_DBUS_TARGET_PATH

  const stop = deps.spawnLines(
    gdbus,
    ["monitor", "--system", "--dest", BUS_NAME, "--object-path", objectPath],
    line => {
      const parsed = parseInputEventLine(line)
      if (!parsed) return
      const event = dbusCapabilityToShortcutEvent(
        parsed.capability,
        parsed.value,
      )
      if (event) deps.onShortcutEvent(event)
    },
  )

  return { close: stop }
}
