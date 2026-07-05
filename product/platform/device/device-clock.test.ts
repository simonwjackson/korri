import { describe, expect, it } from "bun:test"
import {
  createMinuteClock,
  type MinuteClockTimer,
  msUntilNextMinute,
} from "./device-clock"

describe("msUntilNextMinute", () => {
  it("returns the remaining time to the next :00 boundary", () => {
    expect(msUntilNextMinute(new Date("2026-06-30T16:24:37.000Z"))).toBe(23_000)
    expect(msUntilNextMinute(new Date("2026-06-30T16:24:59.500Z"))).toBe(500)
  })

  it("returns a full minute when already exactly on a boundary", () => {
    expect(msUntilNextMinute(new Date("2026-06-30T16:24:00.000Z"))).toBe(60_000)
  })

  it("is timezone-independent (only the sub-minute position matters)", () => {
    // A 30-minute-offset zone still shares the same seconds/millis position.
    expect(msUntilNextMinute(new Date("2026-06-30T16:54:37.250Z"))).toBe(22_750)
  })
})

interface ScheduledTask {
  readonly callback: () => void
  readonly ms: number
  cancelled: boolean
}

function fakeScheduler() {
  const tasks: ScheduledTask[] = []
  return {
    schedule: (callback: () => void, ms: number): MinuteClockTimer => {
      const task: ScheduledTask = { callback, ms, cancelled: false }
      tasks.push(task)
      return task
    },
    cancel: (timer: MinuteClockTimer) => {
      ;(timer as ScheduledTask).cancelled = true
    },
    /** Run the most recently scheduled, not-yet-cancelled task. */
    runNext: () => {
      const task = tasks[tasks.length - 1]
      if (task && !task.cancelled) task.callback()
    },
    lastDelay: () => tasks[tasks.length - 1]?.ms,
    pending: () => tasks.filter(task => !task.cancelled).length,
  }
}

describe("createMinuteClock", () => {
  it("emits the current instant immediately (current-first)", () => {
    const scheduler = fakeScheduler()
    const seen: string[] = []
    const clock = createMinuteClock({
      now: () => new Date("2026-06-30T16:24:37.000Z"),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    })

    clock.subscribe(now => seen.push(now.toISOString()))

    expect(seen).toEqual(["2026-06-30T16:24:37.000Z"])
  })

  it("schedules the first tick aligned to the next minute boundary", () => {
    const scheduler = fakeScheduler()
    const clock = createMinuteClock({
      now: () => new Date("2026-06-30T16:24:37.000Z"),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    })

    clock.subscribe(() => undefined)

    expect(scheduler.lastDelay()).toBe(23_000)
  })

  it("re-emits at each boundary and re-aligns from the advancing clock", () => {
    const scheduler = fakeScheduler()
    const times = [
      "2026-06-30T16:24:37.000Z",
      "2026-06-30T16:25:00.000Z",
      "2026-06-30T16:26:00.000Z",
    ]
    let index = 0
    const clock = createMinuteClock({
      now: () => new Date(times[Math.min(index, times.length - 1)]),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    })

    const seen: string[] = []
    clock.subscribe(now => seen.push(now.toISOString()))

    index = 1
    scheduler.runNext()
    expect(scheduler.lastDelay()).toBe(60_000)

    index = 2
    scheduler.runNext()

    expect(seen).toEqual([
      "2026-06-30T16:24:37.000Z",
      "2026-06-30T16:25:00.000Z",
      "2026-06-30T16:26:00.000Z",
    ])
  })

  it("stops emitting and cancels the pending timer after unsubscribe", () => {
    const scheduler = fakeScheduler()
    let current = "2026-06-30T16:24:37.000Z"
    const clock = createMinuteClock({
      now: () => new Date(current),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    })

    const seen: string[] = []
    const unsubscribe = clock.subscribe(now => seen.push(now.toISOString()))
    unsubscribe()

    expect(scheduler.pending()).toBe(0)

    current = "2026-06-30T16:25:00.000Z"
    scheduler.runNext()

    expect(seen).toEqual(["2026-06-30T16:24:37.000Z"])
  })
})
