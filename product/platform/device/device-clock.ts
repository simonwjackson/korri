/**
 * A minute-aligned wall-clock ticker. It is the small engine that feeds a
 * surface the current time the same way the device engine feeds battery: the
 * surface is handed a value, it never reads the clock itself.
 *
 * The tick is aligned to the wall-clock minute boundary rather than a fixed
 * stopwatch interval. If it fired every 60s from an arbitrary start it would
 * flip the displayed minute at a random second and read up to ~59s stale. By
 * scheduling the next emission for the next `:00`, the visible minute changes at
 * the same instant the real minute does, and the alignment self-corrects on
 * every tick so it never drifts.
 *
 * `now`, `schedule`, and `cancel` are injectable so the whole thing is
 * deterministic under test and harness control.
 */

export type MinuteClockTimer = unknown

export interface MinuteClockOptions {
  readonly now?: () => Date
  readonly schedule?: (callback: () => void, ms: number) => MinuteClockTimer
  readonly cancel?: (timer: MinuteClockTimer) => void
}

export interface MinuteClock {
  readonly subscribe: (listener: (now: Date) => void) => () => void
}

const MINUTE_MS = 60_000

/**
 * Milliseconds from `now` until the next wall-clock minute boundary (`:00`).
 * Timezone-independent: whole-minute offsets do not change the sub-minute
 * position, so seconds/milliseconds alone determine the boundary.
 */
export function msUntilNextMinute(now: Date): number {
  const withinMinute = now.getUTCSeconds() * 1000 + now.getUTCMilliseconds()
  const remaining = MINUTE_MS - withinMinute
  return remaining === 0 ? MINUTE_MS : remaining
}

export function createMinuteClock(
  options: MinuteClockOptions = {},
): MinuteClock {
  const now = options.now ?? (() => new Date())
  const schedule =
    options.schedule ?? ((callback, ms) => globalThis.setTimeout(callback, ms))
  const cancel =
    options.cancel ??
    ((timer: MinuteClockTimer) =>
      globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>))

  return {
    subscribe(listener) {
      let active = true
      let timer: MinuteClockTimer | undefined

      const emitAndSchedule = () => {
        if (!active) return
        listener(now())
        timer = schedule(emitAndSchedule, msUntilNextMinute(now()))
      }

      // Current-first: the subscriber gets the time immediately, then aligned
      // ticks land on each minute boundary.
      emitAndSchedule()

      return () => {
        active = false
        if (timer !== undefined) cancel(timer)
      }
    },
  }
}
