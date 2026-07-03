import { describe, expect, it } from "bun:test"
import {
  createSwayLaneEventSupervisor,
  type SwayLaneEventSupervisorSource,
} from "./sessiond-sway-lane-supervisor"

interface FakeTimer {
  readonly id: number
  readonly callback: () => void
  readonly ms: number
}

function createTimerHarness() {
  const timers: FakeTimer[] = []
  let nextId = 1
  return {
    setTimer: (callback: () => void, ms: number) => {
      const timer = { id: nextId++, callback, ms }
      timers.push(timer)
      return timer.id
    },
    clearTimer: (handle: unknown) => {
      const index = timers.findIndex(timer => timer.id === handle)
      if (index >= 0) timers.splice(index, 1)
    },
    pending: () => timers.length,
    fireNext: () => {
      const timer = timers.shift()
      if (!timer) throw new Error("no pending timer to fire")
      timer.callback()
    },
  }
}

interface FakeSourceHandle {
  readonly source: SwayLaneEventSupervisorSource
  open: () => void
  close: () => void
  resolveStart: () => void
  rejectStart: (error: unknown) => void
  readonly stopped: () => number
  readonly startCount: () => number
}

function createSourceFactory() {
  const handles: FakeSourceHandle[] = []
  let onStatusRef: ((status: "open" | "closed") => void) | undefined
  const socketPaths: string[] = []

  const createSource = (input: {
    socketPath: string
    onStatus: (status: "open" | "closed") => void
  }): SwayLaneEventSupervisorSource => {
    socketPaths.push(input.socketPath)
    onStatusRef = input.onStatus
    const capturedOnStatus = input.onStatus
    let stopped = 0
    let startCount = 0
    let resolve: () => void = () => {}
    let reject: (error: unknown) => void = () => {}
    const source: SwayLaneEventSupervisorSource = {
      start: () => {
        startCount++
        return new Promise<void>((res, rej) => {
          resolve = res
          reject = rej
        })
      },
      stop: () => {
        stopped++
      },
    }
    const handle: FakeSourceHandle = {
      source,
      open: () => capturedOnStatus("open"),
      close: () => capturedOnStatus("closed"),
      resolveStart: () => resolve(),
      rejectStart: error => reject(error),
      stopped: () => stopped,
      startCount: () => startCount,
    }
    handles.push(handle)
    return source
  }

  return {
    createSource,
    handles,
    socketPaths,
    latestOnStatus: () => onStatusRef,
  }
}

describe("createSwayLaneEventSupervisor", () => {
  it("becomes available once discovery succeeds and the source opens", () => {
    const timers = createTimerHarness()
    const factory = createSourceFactory()
    const supervisor = createSwayLaneEventSupervisor({
      discover: () => "/run/user/2000/sway-ipc.100.sock",
      createSource: factory.createSource,
      retryDelayMs: 1000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    })

    expect(supervisor.isAvailable()).toBe(false)
    supervisor.start()
    expect(factory.handles).toHaveLength(1)
    expect(supervisor.isAvailable()).toBe(false)

    factory.handles[0]!.open()
    expect(supervisor.isAvailable()).toBe(true)
  })

  it("retries discovery until the compositor socket appears (cold-boot race)", () => {
    const timers = createTimerHarness()
    const factory = createSourceFactory()
    let discoverCalls = 0
    const supervisor = createSwayLaneEventSupervisor({
      discover: () => {
        discoverCalls++
        return discoverCalls >= 3
          ? "/run/user/2000/sway-ipc.100.sock"
          : undefined
      },
      createSource: factory.createSource,
      retryDelayMs: 1000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    })

    supervisor.start()
    // First attempt: no socket, no source, one retry scheduled.
    expect(factory.handles).toHaveLength(0)
    expect(timers.pending()).toBe(1)

    timers.fireNext() // 2nd attempt: still no socket
    expect(factory.handles).toHaveLength(0)
    expect(timers.pending()).toBe(1)

    timers.fireNext() // 3rd attempt: socket now present
    expect(factory.handles).toHaveLength(1)
    factory.handles[0]!.open()
    expect(supervisor.isAvailable()).toBe(true)
  })

  it("reconnects and re-discovers the socket path after the source closes (post-crash)", () => {
    const timers = createTimerHarness()
    const factory = createSourceFactory()
    const paths = [
      "/run/user/2000/sway-ipc.100.sock",
      "/run/user/2000/sway-ipc.200.sock",
    ]
    let discoverCalls = 0
    const supervisor = createSwayLaneEventSupervisor({
      discover: () => paths[Math.min(discoverCalls++, paths.length - 1)],
      createSource: factory.createSource,
      retryDelayMs: 1000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    })

    supervisor.start()
    factory.handles[0]!.open()
    expect(supervisor.isAvailable()).toBe(true)

    // Compositor/gamescope crash: the socket connection closes.
    factory.handles[0]!.close()
    expect(supervisor.isAvailable()).toBe(false)
    expect(factory.handles[0]!.stopped()).toBeGreaterThanOrEqual(1)
    expect(timers.pending()).toBe(1)

    timers.fireNext() // reconnect attempt re-discovers the new pid-suffixed path
    expect(factory.handles).toHaveLength(2)
    expect(factory.socketPaths[1]).toBe("/run/user/2000/sway-ipc.200.sock")

    factory.handles[1]!.open()
    expect(supervisor.isAvailable()).toBe(true)
  })

  it("schedules a retry when the source fails to start", async () => {
    const timers = createTimerHarness()
    const factory = createSourceFactory()
    const supervisor = createSwayLaneEventSupervisor({
      discover: () => "/run/user/2000/sway-ipc.100.sock",
      createSource: factory.createSource,
      retryDelayMs: 1000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    })

    supervisor.start()
    factory.handles[0]!.rejectStart(new Error("connect refused"))
    await Promise.resolve()
    await Promise.resolve()

    expect(supervisor.isAvailable()).toBe(false)
    expect(timers.pending()).toBe(1)
  })

  it("stops cleanly and ignores stale callbacks after stop()", () => {
    const timers = createTimerHarness()
    const factory = createSourceFactory()
    const supervisor = createSwayLaneEventSupervisor({
      discover: () => "/run/user/2000/sway-ipc.100.sock",
      createSource: factory.createSource,
      retryDelayMs: 1000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    })

    supervisor.start()
    factory.handles[0]!.open()
    expect(supervisor.isAvailable()).toBe(true)

    supervisor.stop()
    expect(supervisor.isAvailable()).toBe(false)
    expect(factory.handles[0]!.stopped()).toBeGreaterThanOrEqual(1)
    expect(timers.pending()).toBe(0)

    // A late close callback from the torn-down source must not schedule work.
    factory.handles[0]!.close()
    expect(timers.pending()).toBe(0)
    expect(supervisor.isAvailable()).toBe(false)
  })
})
