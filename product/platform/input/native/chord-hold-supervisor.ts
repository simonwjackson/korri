/**
 * Adds a time dimension to an already-assembled button chord.
 *
 * The system-shortcut and button-chord engines are purely press/release: a
 * chord "fires" the instant all of its controls are down. That is the correct
 * primitive for momentary shortcuts, but a destructive action (quitting a
 * game) should be a *deliberate* act, not an accident. This supervisor turns a
 * single chord into a held gesture:
 *
 *   engage(id)  -> "press" (progress 0)
 *               -> "progress" ticks (0 -> 1) while the chord stays held
 *               -> "fired"    once the hold passes the threshold
 *   release(id) before the threshold -> "tap" (the chord was a quick press)
 *   release(id) after "fired"        -> nothing (the act already committed)
 *
 * It owns no input plumbing and no rendering: callers translate real evdev
 * chord begin/break into engage/release, and consumers (an overlay ring, a
 * force-quit action) subscribe to the emitted updates. Timers are injected so
 * the whole state machine is deterministic under test.
 */

export type ChordHoldPhase = "press" | "progress" | "fired" | "tap"

export interface ChordHoldUpdate<Id extends string = string> {
  readonly id: Id
  readonly phase: ChordHoldPhase
  /** 0 at press, 1 at fire; the fraction reached at release for a tap. */
  readonly progress: number
  readonly elapsedMs: number
}

export interface ChordHoldTimers {
  readonly now: () => number
  readonly setInterval: (callback: () => void, ms: number) => unknown
  readonly clearInterval: (handle: unknown) => void
}

export interface ChordHoldSupervisor<Id extends string = string> {
  /** The chord became fully held. Starts the hold timer. */
  readonly engage: (id: Id) => void
  /** The chord was broken (a required control released). */
  readonly release: (id: Id) => void
  /** True if the given id (or any id) is currently held. */
  readonly isHolding: (id?: Id) => boolean
  /** Cancel every in-flight hold without firing. */
  readonly reset: () => void
}

interface HoldState {
  readonly startedAt: number
  fired: boolean
  handle: unknown
}

const DEFAULT_HOLD_MS = 2000
const DEFAULT_TICK_MS = 50

const defaultTimers: ChordHoldTimers = {
  now: () => Date.now(),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: handle => {
    if (handle !== undefined)
      clearInterval(handle as ReturnType<typeof setInterval>)
  },
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function createChordHoldSupervisor<const Id extends string>(options: {
  readonly holdMs?: number
  readonly tickMs?: number
  readonly onUpdate: (update: ChordHoldUpdate<Id>) => void
  readonly timers?: ChordHoldTimers
}): ChordHoldSupervisor<Id> {
  const holdMs = options.holdMs ?? DEFAULT_HOLD_MS
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS
  const timers = options.timers ?? defaultTimers
  const holds = new Map<Id, HoldState>()

  function stop(id: Id): void {
    const state = holds.get(id)
    if (!state) return
    timers.clearInterval(state.handle)
    holds.delete(id)
  }

  function tick(id: Id): void {
    const state = holds.get(id)
    if (!state || state.fired) return

    const elapsedMs = timers.now() - state.startedAt
    if (elapsedMs >= holdMs) {
      state.fired = true
      timers.clearInterval(state.handle)
      state.handle = undefined
      options.onUpdate({ id, phase: "fired", progress: 1, elapsedMs })
      return
    }

    options.onUpdate({
      id,
      phase: "progress",
      progress: clamp01(elapsedMs / holdMs),
      elapsedMs,
    })
  }

  return {
    engage(id) {
      if (holds.has(id)) return

      const startedAt = timers.now()
      const state: HoldState = { startedAt, fired: false, handle: undefined }
      holds.set(id, state)
      options.onUpdate({ id, phase: "press", progress: 0, elapsedMs: 0 })

      if (holdMs <= 0) {
        state.fired = true
        options.onUpdate({ id, phase: "fired", progress: 1, elapsedMs: 0 })
        return
      }

      state.handle = timers.setInterval(() => tick(id), tickMs)
    },

    release(id) {
      const state = holds.get(id)
      if (!state) return

      const fired = state.fired
      const elapsedMs = timers.now() - state.startedAt
      stop(id)
      if (fired) return

      options.onUpdate({
        id,
        phase: "tap",
        progress: clamp01(elapsedMs / holdMs),
        elapsedMs,
      })
    },

    isHolding(id) {
      if (id === undefined) return holds.size > 0
      return holds.has(id)
    },

    reset() {
      for (const id of [...holds.keys()]) stop(id)
    },
  }
}
