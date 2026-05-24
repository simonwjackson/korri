import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createPollingLoop } from "./polling-loop"

/**
 * Tests use configured-real primitives — a recorder for interval calls
 * and a recorder for fetch calls. No mock framework: the polling loop
 * accepts injected primitives so driving it from the test body is as
 * simple as calling a recorded callback synchronously.
 */

interface IntervalRecorder {
  readonly setInterval: typeof setInterval
  readonly clearInterval: typeof clearInterval
  /** Run the next scheduled tick synchronously. Throws if none queued. */
  readonly tick: () => void
  /** Returns true if a callback is currently scheduled. */
  readonly hasPending: () => boolean
}

function createIntervalRecorder(): IntervalRecorder {
  let next: (() => void) | undefined
  let nextHandle = 1
  let cleared = false

  const recordedSetInterval = ((callback: () => void, _ms: number) => {
    cleared = false
    next = callback
    return nextHandle++ as unknown as ReturnType<typeof setInterval>
  }) as typeof setInterval

  const recordedClearInterval = ((_handle: unknown) => {
    cleared = true
    next = undefined
  }) as typeof clearInterval

  return {
    setInterval: recordedSetInterval,
    clearInterval: recordedClearInterval,
    tick: () => {
      if (cleared) throw new Error("interval cleared")
      if (!next) throw new Error("no pending tick")
      next()
    },
    hasPending: () => next !== undefined && !cleared,
  }
}

interface FetchRecorder {
  readonly fetch: (input: RequestInfo | URL) => Promise<Response>
  readonly calls: Array<RequestInfo | URL>
  /** Configure the next response. */
  setResponse(body: () => Promise<Response> | Response | Promise<never>): void
}

function createFetchRecorder(): FetchRecorder {
  const calls: Array<RequestInfo | URL> = []
  let next: () => Promise<Response> | Response | Promise<never> = () =>
    new Response("{}", { status: 200 })

  return {
    fetch: async input => {
      calls.push(input)
      return await next()
    },
    calls,
    setResponse(body) {
      next = body
    },
  }
}

interface Setup {
  readonly interval: IntervalRecorder
  readonly fetchRecorder: FetchRecorder
  readonly reloadCalls: { count: number }
  readonly loop: ReturnType<typeof createPollingLoop>
}

function setup(): Setup {
  const interval = createIntervalRecorder()
  const fetchRecorder = createFetchRecorder()
  const reloadCalls = { count: 0 }
  const loop = createPollingLoop({
    fetch: fetchRecorder.fetch,
    reload: () => {
      reloadCalls.count += 1
    },
    setInterval: interval.setInterval,
    clearInterval: interval.clearInterval,
    url: "/__korri/desktop/connection-status",
    intervalMs: 750,
  })
  return { interval, fetchRecorder, reloadCalls, loop }
}

// Bun's bun:test does not currently expose a real microtask flush across
// the test boundary; awaiting Bun.sleep(0) is enough to drain the
// promise chain spawned inside a tick.
async function drain() {
  await Bun.sleep(0)
  await Bun.sleep(0)
}

let cleanup: Array<() => void> = []
beforeEach(() => {
  cleanup = []
})
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
})

describe("createPollingLoop", () => {
  test("first tick calls fetch with the configured url", async () => {
    const { interval, fetchRecorder, loop } = setup()
    loop.start()
    cleanup.push(() => loop.dispose())

    interval.tick()
    await drain()

    expect(fetchRecorder.calls.length).toBe(1)
    expect(String(fetchRecorder.calls[0])).toBe(
      "/__korri/desktop/connection-status",
    )
  })

  test("status: connected triggers reload exactly once", async () => {
    const { interval, fetchRecorder, reloadCalls, loop } = setup()
    fetchRecorder.setResponse(
      () =>
        new Response(JSON.stringify({ status: "connected" }), { status: 200 }),
    )
    loop.start()
    cleanup.push(() => loop.dispose())

    interval.tick()
    await drain()

    expect(reloadCalls.count).toBe(1)
  })

  test("status: searching does not reload; loop stays scheduled", async () => {
    const { interval, fetchRecorder, reloadCalls, loop } = setup()
    fetchRecorder.setResponse(
      () =>
        new Response(JSON.stringify({ status: "searching" }), { status: 200 }),
    )
    loop.start()
    cleanup.push(() => loop.dispose())

    interval.tick()
    await drain()

    expect(reloadCalls.count).toBe(0)
    expect(interval.hasPending()).toBe(true)
  })

  test("network failure (fetch rejects) does not reload; loop survives", async () => {
    const { interval, fetchRecorder, reloadCalls, loop } = setup()
    fetchRecorder.setResponse(() => Promise.reject(new Error("offline")))
    loop.start()
    cleanup.push(() => loop.dispose())

    interval.tick()
    await drain()

    expect(reloadCalls.count).toBe(0)
    expect(interval.hasPending()).toBe(true)
  })

  test("malformed JSON body does not reload; loop survives", async () => {
    const { interval, fetchRecorder, reloadCalls, loop } = setup()
    fetchRecorder.setResponse(() => new Response("not-json", { status: 200 }))
    loop.start()
    cleanup.push(() => loop.dispose())

    interval.tick()
    await drain()

    expect(reloadCalls.count).toBe(0)
    expect(interval.hasPending()).toBe(true)
  })

  test("HTTP 5xx does not reload; loop survives", async () => {
    const { interval, fetchRecorder, reloadCalls, loop } = setup()
    fetchRecorder.setResponse(() => new Response("oops", { status: 503 }))
    loop.start()
    cleanup.push(() => loop.dispose())

    interval.tick()
    await drain()

    expect(reloadCalls.count).toBe(0)
    expect(interval.hasPending()).toBe(true)
  })

  test("dispose() clears the interval and stops further fetches", async () => {
    const { interval, fetchRecorder, loop } = setup()
    loop.start()
    loop.dispose()

    expect(interval.hasPending()).toBe(false)
    expect(fetchRecorder.calls.length).toBe(0)
  })
})
