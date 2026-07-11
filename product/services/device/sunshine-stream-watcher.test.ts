import { describe, expect, it } from "bun:test"
import { createSunshineStreamWatcher } from "./sunshine-stream-watcher"

function logger() {
  const entries: Array<{ level: string; message?: string }> = []
  return {
    entries,
    logger: {
      debug: (_input: unknown, message?: string) =>
        entries.push({ level: "debug", message }),
      info: (_input: unknown, message?: string) =>
        entries.push({ level: "info", message }),
      warn: (_input: unknown, message?: string) =>
        entries.push({ level: "warn", message }),
      error: (_input: unknown, message?: string) =>
        entries.push({ level: "error", message }),
    },
  }
}

/** Push-driven line source: tests feed lines and end/fail streams on demand. */
function lineSource() {
  const queue: string[] = []
  let notify: (() => void) | null = null
  let ended = false
  let failure: Error | null = null
  const opens: number[] = []
  let openCount = 0

  async function* stream(): AsyncGenerator<string> {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift() as string
        continue
      }
      if (failure) {
        const error = failure
        failure = null
        throw error
      }
      if (ended) return
      await new Promise<void>(resolve => {
        notify = resolve
      })
    }
  }

  return {
    opens,
    openLogStream: async () => {
      openCount += 1
      opens.push(openCount)
      ended = false
      return stream()
    },
    push(line: string) {
      queue.push(line)
      notify?.()
      notify = null
    },
    end() {
      ended = true
      notify?.()
      notify = null
    },
    fail(error: Error) {
      failure = error
      notify?.()
      notify = null
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function harness(
  options: {
    readonly debounceMs?: number
    readonly freeze?: () => Promise<void>
    readonly maxReopenAttempts?: number
  } = {},
) {
  const source = lineSource()
  const log = logger()
  const calls: string[] = []
  const watcher = createSunshineStreamWatcher({
    openLogStream: source.openLogStream,
    freezeActiveLaunch:
      options.freeze ??
      (async () => {
        calls.push("freeze")
      }),
    thawActiveLaunch: async () => {
      calls.push("thaw")
    },
    logger: log.logger,
    debounceMs: options.debounceMs ?? 5,
    reopenDelayMs: 1,
    maxReopenAttempts: options.maxReopenAttempts ?? 3,
  })
  return { source, log, calls, watcher }
}

describe("sunshine stream watcher", () => {
  it("freezes the active launch after a disconnect signal and debounce", async () => {
    const { source, calls, watcher } = harness()
    watcher.start()
    await sleep(5)
    source.push("[2026-07-10 20:00:00.000]: Info: CLIENT DISCONNECTED")
    await sleep(30)
    expect(calls).toEqual(["freeze"])
    watcher.stop()
  })

  it("does not freeze when a reconnect arrives within the debounce window", async () => {
    const { source, calls, watcher } = harness({ debounceMs: 40 })
    watcher.start()
    await sleep(5)
    source.push("Info: CLIENT DISCONNECTED")
    await sleep(5)
    source.push("Info: New streaming session started [active sessions: 1]")
    await sleep(80)
    expect(calls).toEqual(["thaw"])
    watcher.stop()
  })

  it("coalesces duplicate disconnect signals into one freeze", async () => {
    const { source, calls, watcher } = harness()
    watcher.start()
    await sleep(5)
    source.push("Info: CLIENT DISCONNECTED")
    source.push("Info: CLIENT DISCONNECTED")
    await sleep(30)
    expect(calls).toEqual(["freeze"])
    watcher.stop()
  })

  it("thaws immediately on a reconnect signal", async () => {
    const { source, calls, watcher } = harness()
    watcher.start()
    await sleep(5)
    source.push("Info: New streaming session started [active sessions: 1]")
    await sleep(20)
    expect(calls).toEqual(["thaw"])
    watcher.stop()
  })

  it("logs freeze failures and keeps watching", async () => {
    const { source, log, calls, watcher } = harness({
      freeze: async () => {
        throw new Error("sessiond said no")
      },
    })
    watcher.start()
    await sleep(5)
    source.push("Info: CLIENT DISCONNECTED")
    await sleep(30)
    expect(log.entries.some(entry => entry.level === "warn")).toBe(true)
    source.push("Info: New streaming session started [active sessions: 1]")
    await sleep(20)
    expect(calls).toEqual(["thaw"])
    watcher.stop()
  })

  it("reopens the log stream on loss without emitting freeze or thaw", async () => {
    const { source, calls, watcher } = harness()
    watcher.start()
    await sleep(5)
    source.fail(new Error("log rotated"))
    await sleep(30)
    expect(source.opens.length).toBeGreaterThanOrEqual(2)
    expect(calls).toEqual([])
    // The reopened stream still delivers signals.
    source.push("Info: CLIENT DISCONNECTED")
    await sleep(30)
    expect(calls).toEqual(["freeze"])
    watcher.stop()
  })

  it("stops cleanly: pending freezes are cancelled and lines are ignored", async () => {
    const { source, calls, watcher } = harness({ debounceMs: 40 })
    watcher.start()
    await sleep(5)
    source.push("Info: CLIENT DISCONNECTED")
    await sleep(5)
    watcher.stop()
    await sleep(80)
    expect(calls).toEqual([])
  })
})
