/**
 * Adds a time dimension to an already-assembled button chord, with three
 * outcomes decided purely by how long the chord is held:
 *
 *   engage(id) -> "press"
 *     released within tapMs                 -> "tap"    (a quick press: open menu)
 *     released after tapMs, before holdMs    -> "cancel" (back to the game)
 *     held to holdMs                         -> "fired"  (quit)
 *
 * The ring only fills AFTER the tap window (a buffer), emitted as "progress"
 * from 0 at tapMs to 1 at holdMs. So a quick tap never flashes the ring, and the
 * ring and the menu are never on screen at the same time.
 *
 * It owns no input plumbing and no rendering. Timers are injected so the whole
 * state machine is deterministic under test.
 */

export type ChordHoldPhase = "press" | "progress" | "fired" | "tap" | "cancel"

export interface ChordHoldUpdate<Id extends string = string> {
  readonly id: Id
  readonly phase: ChordHoldPhase
  /** Ring fill 0..1 across the post-buffer window (0 at tapMs, 1 at holdMs). */
  readonly progress: number
  readonly elapsedMs: number
}

export interface ChordHoldTimers {
  readonly now: () => number
  readonly setInterval: (callback: () => void, ms: number) => unknown
  readonly clearInterval: (handle: unknown) => void
}

export interface ChordHoldSupervisor<Id extends string = string> {
  readonly engage: (id: Id) => void
  readonly release: (id: Id) => void
  readonly isHolding: (id?: Id) => boolean
  readonly reset: () => void
}

interface HoldState {
  readonly startedAt: number
  fired: boolean
  handle: unknown
}

const DEFAULT_HOLD_MS = 2000
const DEFAULT_TAP_MS = 250
const DEFAULT_TICK_MS = 50

const defaultTimers: ChordHoldTimers = {
  now: () => Date.now(),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: handle => {
    if (handle !== undefined) clearInterval(handle as ReturnType<typeof setInterval>)
  },
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function createChordHoldSupervisor<const Id extends string>(options: {
  readonly holdMs?: number
  readonly tapMs?: number
  readonly tickMs?: number
  readonly onUpdate: (update: ChordHoldUpdate<Id>) => void
  readonly timers?: ChordHoldTimers
}): ChordHoldSupervisor<Id> {
  const holdMs = options.holdMs ?? DEFAULT_HOLD_MS
  const tapMs = Math.min(options.tapMs ?? DEFAULT_TAP_MS, holdMs)
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS
  const timers = options.timers ?? defaultTimers
  const holds = new Map<Id, HoldState>()
  const span = Math.max(1, holdMs - tapMs)

  function fillFor(elapsedMs: number): number {
    return clamp01((elapsedMs - tapMs) / span)
  }

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
    // Buffer: nothing is shown until the tap window has passed.
    if (elapsedMs < tapMs) return
    options.onUpdate({
      id,
      phase: "progress",
      progress: fillFor(elapsedMs),
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
      if (elapsedMs < tapMs) {
        options.onUpdate({ id, phase: "tap", progress: 0, elapsedMs })
      } else {
        options.onUpdate({
          id,
          phase: "cancel",
          progress: fillFor(elapsedMs),
          elapsedMs,
        })
      }
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
