/**
 * Live InputPlumberInterceptPort backed by busctl (set InterceptMode) and gdbus
 * monitor (subscribe to intercepted ui_* events on the DBus target).
 *
 * Validated on Bandai: korri can write InterceptMode without root, and the
 * dbus0 target emits `InputEvent ('ui_left', 1.0)` style signals we parse here.
 * The line parser is pure/tested; the subprocess wiring is a thin adapter.
 */
import type {
  InputPlumberInterceptPort,
  InterceptMode,
} from "./overlay-intercept"

const BUS_NAME = "org.shadowblip.InputPlumber"
const COMPOSITE_DEVICE = "/org/shadowblip/InputPlumber/CompositeDevice0"
const COMPOSITE_IFACE = "org.shadowblip.Input.CompositeDevice"
const DBUS0 = "/org/shadowblip/InputPlumber/devices/target/dbus0"

export interface ParsedInputEvent {
  readonly capability: string
  readonly value: number
}

/**
 * Parse a gdbus monitor line for an InputEvent signal, e.g.
 *   /org/.../dbus0: org.shadowblip.Input.DBusDevice.InputEvent ('ui_left', 1.0)
 * Returns null for unrelated lines.
 */
export function parseInputEventLine(line: string): ParsedInputEvent | null {
  const match = line.match(
    /InputEvent\s*\(\s*'([^']+)'\s*,\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\)/,
  )
  if (!match) return null
  return { capability: match[1], value: Number(match[2]) }
}

export interface InterceptSubprocess {
  /** Run a command to completion (busctl set-property). */
  readonly run: (command: string, args: readonly string[]) => Promise<void>
  /**
   * Spawn a long-running command and deliver its stdout line by line.
   * Returns a stop() that terminates it.
   */
  readonly spawnLines: (
    command: string,
    args: readonly string[],
    onLine: (line: string) => void,
  ) => () => void
}

export function createLiveInterceptPort(deps: {
  readonly subprocess: InterceptSubprocess
  readonly busctl?: string
  readonly gdbus?: string
  /** Path to coreutils `stdbuf`, used to force line-buffered monitor output. */
  readonly stdbuf?: string
  /** When true, log every received monitor line to stderr for diagnosis. */
  readonly debug?: boolean
}): InputPlumberInterceptPort {
  const busctl = deps.busctl ?? "busctl"
  const gdbus = deps.gdbus ?? "gdbus"
  const stdbuf = deps.stdbuf ?? "stdbuf"
  const debug = deps.debug ?? false
  return {
    async setInterceptMode(mode: InterceptMode) {
      await deps.subprocess.run(busctl, [
        "--system",
        "set-property",
        BUS_NAME,
        COMPOSITE_DEVICE,
        COMPOSITE_IFACE,
        "InterceptMode",
        "u",
        String(mode),
      ])
    },
    subscribeInputEvents(onEvent) {
      // gdbus block-buffers stdout when it is a pipe (not a tty), so inputd
      // received intercepted events in delayed batches -- the first press of a
      // burst sat in gdbus's buffer until later output flushed it, which looked
      // like a dropped first press. Wrap the monitor in `stdbuf -oL` to force
      // line-buffered output so every event is delivered immediately.
      return deps.subprocess.spawnLines(
        stdbuf,
        [
          "-oL",
          gdbus,
          "monitor",
          "--system",
          "--dest",
          BUS_NAME,
          "--object-path",
          DBUS0,
        ],
        line => {
          if (debug && line.includes("InputEvent")) {
            process.stderr.write(
              `[overlay-intercept] ${Date.now()} recv: ${line}\n`,
            )
          }
          const parsed = parseInputEventLine(line)
          if (parsed) onEvent(parsed.capability, parsed.value)
        },
      )
    },
  }
}
