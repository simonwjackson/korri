import { describe, expect, it } from "bun:test"
import {
  createChordHoldSupervisor,
  type ChordHoldTimers,
  type ChordHoldUpdate,
} from "./chord-hold-supervisor"

interface FakeTimers extends ChordHoldTimers {
  advance: (ms: number) => void
}

function createFakeTimers(): FakeTimers {
  let current = 0
  let nextId = 1
  const timers = new Map<number, { cb: () => void; ms: number; next: number }>()
  return {
    now: () => current,
    setInterval(cb, ms) {
      const id = nextId++
      timers.set(id, { cb, ms, next: current + ms })
      return id
    },
    clearInterval(handle) {
      timers.delete(handle as number)
    },
    advance(ms) {
      const target = current + ms
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
        current = due
        const timer = timers.get(dueId)
        if (!timer) continue
        timer.next = current + timer.ms
        timer.cb()
      }
      current = target
    },
  }
}

function makeSupervisor(overrides?: { holdMs?: number; tapMs?: number; tickMs?: number }) {
  const updates: ChordHoldUpdate<"kill">[] = []
  const timers = createFakeTimers()
  const supervisor = createChordHoldSupervisor<"kill">({
    holdMs: overrides?.holdMs ?? 2000,
    tapMs: overrides?.tapMs ?? 200,
    tickMs: overrides?.tickMs ?? 100,
    onUpdate: update => updates.push(update),
    timers,
  })
  return { updates, timers, supervisor }
}

const phases = (u: ChordHoldUpdate<"kill">[]) => u.map(x => x.phase)

describe("chord hold supervisor", () => {
  it("emits a press with zero progress on engage", () => {
    const { updates, supervisor } = makeSupervisor()
    supervisor.engage("kill")
    expect(updates).toEqual([
      { id: "kill", phase: "press", progress: 0, elapsedMs: 0 },
    ])
    expect(supervisor.isHolding("kill")).toBe(true)
  })

  it("shows nothing during the tap/buffer window", () => {
    const { updates, timers, supervisor } = makeSupervisor({ tapMs: 200 })
    supervisor.engage("kill")
    timers.advance(150) // still inside the tap window
    expect(phases(updates)).toEqual(["press"]) // no progress yet
  })

  it("fills the ring only after the buffer, 0 -> 1 across [tapMs, holdMs]", () => {
    const { updates, timers, supervisor } = makeSupervisor({
      holdMs: 2000,
      tapMs: 200,
      tickMs: 100,
    })
    supervisor.engage("kill")
    timers.advance(1100) // elapsed 1100 -> (1100-200)/1800 = 0.5
    const progresses = updates.filter(u => u.phase === "progress")
    expect(progresses.length).toBeGreaterThan(0)
    for (const p of progresses) {
      expect(p.progress).toBeGreaterThanOrEqual(0) // first tick at tapMs is 0
      expect(p.progress).toBeLessThan(1)
    }
    const values = progresses.map(p => p.progress)
    expect([...values].sort((a, b) => a - b)).toEqual(values) // monotonic
    expect(progresses.at(-1)?.progress).toBeCloseTo(0.5, 5)
  })

  it("fires once at the hold threshold", () => {
    const { updates, timers, supervisor } = makeSupervisor({ holdMs: 2000 })
    supervisor.engage("kill")
    timers.advance(2000)
    const fired = updates.filter(u => u.phase === "fired")
    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ progress: 1, elapsedMs: 2000 })
  })

  it("a quick release (within the tap window) is a tap", () => {
    const { updates, timers, supervisor } = makeSupervisor({ tapMs: 200 })
    supervisor.engage("kill")
    timers.advance(120)
    supervisor.release("kill")
    expect(phases(updates)).toEqual(["press", "tap"])
    expect(updates.some(u => u.phase === "progress")).toBe(false)
  })

  it("a release after the tap window but before threshold is a cancel", () => {
    const { updates, timers, supervisor } = makeSupervisor({
      holdMs: 2000,
      tapMs: 200,
    })
    supervisor.engage("kill")
    timers.advance(500)
    supervisor.release("kill")
    const cancel = updates.find(u => u.phase === "cancel")
    expect(cancel).toBeDefined()
    expect(cancel?.progress).toBeCloseTo((500 - 200) / 1800, 5)
    expect(updates.some(u => u.phase === "tap")).toBe(false)
    expect(updates.some(u => u.phase === "fired")).toBe(false)
  })

  it("emits no tap/cancel after it has fired", () => {
    const { updates, timers, supervisor } = makeSupervisor({ holdMs: 2000 })
    supervisor.engage("kill")
    timers.advance(2000)
    const count = updates.length
    supervisor.release("kill")
    expect(updates.length).toBe(count)
  })

  it("cancels cleanly on reset without firing", () => {
    const { updates, timers, supervisor } = makeSupervisor({ holdMs: 2000 })
    supervisor.engage("kill")
    timers.advance(500)
    supervisor.reset()
    expect(supervisor.isHolding()).toBe(false)
    timers.advance(5000)
    expect(updates.some(u => u.phase === "fired")).toBe(false)
  })

  it("re-arms after release", () => {
    const { updates, timers, supervisor } = makeSupervisor({ holdMs: 2000 })
    supervisor.engage("kill")
    timers.advance(120)
    supervisor.release("kill") // tap
    updates.length = 0
    supervisor.engage("kill")
    timers.advance(2000)
    expect(updates.some(u => u.phase === "fired")).toBe(true)
  })

  it("ignores a release when nothing is held", () => {
    const { updates, supervisor } = makeSupervisor()
    supervisor.release("kill")
    expect(updates).toEqual([])
  })
})
