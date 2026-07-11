/**
 * Host-side stream watcher for the source machine: observes Sunshine's log
 * for client disconnect/reconnect signals and freezes/thaws the active
 * managed launch so an unintentional Moonlight drop (network cut, lid close)
 * stops burning host CPU/GPU by default.
 *
 * Lifetime rules (see docs/solutions/runtime-errors/
 * sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md): the log
 * stream's transport lifetime is decoupled from the game session's lifetime.
 * Losing the log stream triggers a bounded reopen loop and never causes a
 * freeze or thaw by itself -- only matched signal lines do.
 */

export interface SunshineStreamWatcherLogger {
  debug: (input: unknown, message?: string) => void
  info: (input: unknown, message?: string) => void
  warn: (input: unknown, message?: string) => void
  error: (input: unknown, message?: string) => void
}

export interface SunshineStreamWatcherDeps {
  /** Open (or re-open) the Sunshine log as an async line stream. */
  readonly openLogStream: () => Promise<AsyncIterable<string>>
  /** Freeze the active managed launch (idempotent; failures are logged). */
  readonly freezeActiveLaunch: () => Promise<void>
  /** Thaw the active managed launch (idempotent; failures are logged). */
  readonly thawActiveLaunch: () => Promise<void>
  readonly logger: SunshineStreamWatcherLogger
  /** Delay between a disconnect signal and the freeze. Default 3s. */
  readonly debounceMs?: number
  /** Delay between log-stream reopen attempts. Default 1s. */
  readonly reopenDelayMs?: number
  /** Consecutive reopen attempts before giving up. Default 10. */
  readonly maxReopenAttempts?: number
}

export interface SunshineStreamWatcher {
  readonly start: () => void
  readonly stop: () => void
}

/** Sunshine log signal for a client disconnect (graceful or timed-out). */
export const SUNSHINE_DISCONNECT_SIGNAL = "CLIENT DISCONNECTED"
/** Sunshine log signal for a client (re)connecting a stream session. */
export const SUNSHINE_RECONNECT_SIGNAL = "New streaming session started"

const DEFAULT_DEBOUNCE_MS = 3_000
const DEFAULT_REOPEN_DELAY_MS = 1_000
const DEFAULT_MAX_REOPEN_ATTEMPTS = 10

export function createSunshineStreamWatcher(
  deps: SunshineStreamWatcherDeps,
): SunshineStreamWatcher {
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const reopenDelayMs = deps.reopenDelayMs ?? DEFAULT_REOPEN_DELAY_MS
  const maxReopenAttempts =
    deps.maxReopenAttempts ?? DEFAULT_MAX_REOPEN_ATTEMPTS

  let stopped = false
  let pendingFreeze: ReturnType<typeof setTimeout> | undefined

  function cancelPendingFreeze(): void {
    if (pendingFreeze === undefined) return
    clearTimeout(pendingFreeze)
    pendingFreeze = undefined
  }

  function scheduleFreeze(): void {
    if (stopped || pendingFreeze !== undefined) return
    const timer = setTimeout(() => {
      pendingFreeze = undefined
      if (stopped) return
      void deps.freezeActiveLaunch().catch(error => {
        deps.logger.warn(
          { err: error },
          "sunshine-stream-watcher: freeze after disconnect failed",
        )
      })
    }, debounceMs)
    if ("unref" in timer && typeof timer.unref === "function") timer.unref()
    pendingFreeze = timer
  }

  function handleLine(line: string): void {
    if (line.includes(SUNSHINE_DISCONNECT_SIGNAL)) {
      deps.logger.info(
        {},
        "sunshine-stream-watcher: client disconnected; freeze scheduled",
      )
      scheduleFreeze()
      return
    }
    if (line.includes(SUNSHINE_RECONNECT_SIGNAL)) {
      cancelPendingFreeze()
      deps.logger.info(
        {},
        "sunshine-stream-watcher: stream session started; thawing",
      )
      void deps.thawActiveLaunch().catch(error => {
        deps.logger.warn(
          { err: error },
          "sunshine-stream-watcher: thaw after reconnect failed",
        )
      })
    }
  }

  async function consume(): Promise<void> {
    let reopenAttempts = 0
    while (!stopped) {
      let stream: AsyncIterable<string>
      try {
        stream = await deps.openLogStream()
      } catch (error) {
        reopenAttempts += 1
        if (reopenAttempts > maxReopenAttempts) {
          deps.logger.error(
            { err: error, reopenAttempts },
            "sunshine-stream-watcher: giving up reopening the Sunshine log",
          )
          return
        }
        await sleep(reopenDelayMs)
        continue
      }
      try {
        for await (const line of stream) {
          if (stopped) return
          // A delivered line proves the transport works; reset the budget.
          reopenAttempts = 0
          handleLine(line)
        }
      } catch (error) {
        deps.logger.warn(
          { err: error },
          "sunshine-stream-watcher: log stream lost; reopening",
        )
      }
      if (stopped) return
      // Stream ended or failed. Transport loss is not a session signal:
      // reopen after a bounded delay without freezing or thawing.
      reopenAttempts += 1
      if (reopenAttempts > maxReopenAttempts) {
        deps.logger.error(
          { reopenAttempts },
          "sunshine-stream-watcher: log stream reopen budget exhausted",
        )
        return
      }
      await sleep(reopenDelayMs)
    }
  }

  return {
    start() {
      stopped = false
      void consume()
    },
    stop() {
      stopped = true
      cancelPendingFreeze()
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms)
    if ("unref" in timer && typeof timer.unref === "function") timer.unref()
  })
}
