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
      // Fire due intervals in chronological order until we reach the target.
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

function makeSupervisor(overrides?: {
  holdMs?: number
  tickMs?: number
}) {
  const updates: ChordHoldUpdate<"kill">[] = []
  const timers = createFakeTimers()
  const supervisor = createChordHoldSupervisor<"kill">({
    holdMs: overrides?.holdMs ?? 2000,
    tickMs: overrides?.tickMs ?? 100,
    onUpdate: update => updates.push(update),
    timers,
  })
  return { updates, timers, supervisor }
}

describe("chord hold supervisor", () => {
  it("emits a press with zero progress on engage", () => {
    const { updates, supervisor } = makeSupervisor()

    supervisor.engage("kill")

    expect(updates).toEqual([
      { id: "kill", phase: "press", progress: 0, elapsedMs: 0 },
    ])
    expect(supervisor.isHolding("kill")).toBe(true)
  })

  it("fires once after the hold duration elapses", () => {
    const { updates, timers, supervisor } = makeSupervisor({ holdMs: 2000 })

    supervisor.engage("kill")
    timers.advance(2000)

    const fired = updates.filter(u => u.phase === "fired")
    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ id: "kill", progress: 1, elapsedMs: 2000 })
  })

  it("does not fire before the threshold", () => {
    const { updates, timers, supervisor } = makeSupervisor({ holdMs: 2000 })

    supervisor.engage("kill")
    timers.advance(1900)

    expect(updates.some(u => u.phase === "fired")).toBe(false)
  })

  it("emits a tap when released before the threshold", () => {
    const { updates, timers, supervisor } = makeSupervisor({ holdMs: 2000 })

    supervisor.engage("kill")
    timers.advance(500)
    supervisor.release("kill")

    const tap = updates.find(u => u.phase === "tap")
    expect(tap).toBeDefined()
    expect(tap).toMatchObject({ id: "kill", elapsedMs: 500 })
    expect(updates.some(u => u.phase === "fired")).toBe(false)
    expect(supervisor.isHolding("kill")).toBe(false)
  })

  it("does not emit a tap after it has already fired", () => {
    const { updates, timers, supervisor } = makeSupervisor({ holdMs: 2000 })

    supervisor.engage("kill")
    timers.advance(2000)
    const countAfterFire = updates.length

    supervisor.release("kill")

    expect(updates.length).toBe(countAfterFire)
    expect(updates.some(u => u.phase === "tap")).toBe(false)
  })

  it("emits strictly increasing progress between 0 and 1 while held", () => {
    const { updates, timers, supervisor } = makeSupervisor({
      holdMs: 2000,
      tickMs: 100,
    })

    supervisor.engage("kill")
    timers.advance(1000)

    const progresses = updates
      .filter(u => u.phase === "progress")
      .map(u => u.progress)
    expect(progresses.length).toBeGreaterThan(0)
    for (const p of progresses) {
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThan(1)
    }
    const sorted = [...progresses].sort((a, b) => a - b)
    expect(progresses).toEqual(sorted)
  })

  it("ignores a duplicate engage while already holding", () => {
    const { updates, supervisor } = makeSupervisor()

    supervisor.engage("kill")
    const countAfterFirst = updates.length
    supervisor.engage("kill")

    expect(updates.length).toBe(countAfterFirst)
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

  it("re-arms after a release so it can hold again", () => {
    const { updates, timers, supervisor } = makeSupervisor({ holdMs: 2000 })

    supervisor.engage("kill")
    timers.advance(300)
    supervisor.release("kill")
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
