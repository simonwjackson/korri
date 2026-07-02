/**
 * Resilient supervisor for the sessiond lane-aware Sway event source.
 *
 * The kiosk lane policy needs a live connection to the compositor's Sway IPC
 * socket to know when it is safe to toggle the hub/game lanes. Historically
 * that connection was established exactly once at startup: if the socket did
 * not exist yet (cold-boot race where sessiond starts before the compositor)
 * the lane toggle latched unavailable forever, and if the connection later
 * closed (e.g. a nested gamescope crash) it never reconnected. Either way,
 * every managed launch then failed with "lane event source unavailable" until
 * a manual `systemctl --user restart korri-sessiond`.
 *
 * This supervisor makes discovery resilient: it retries discovery until the
 * socket appears, reconnects (re-discovering the pid-suffixed socket path)
 * whenever the source closes or fails to start, and exposes a single
 * `isAvailable()` gate the role reads. It replaces the previous one-shot
 * `createSessiondSwayEventSource` wiring in sessiond.ts.
 */

export interface SwayLaneEventSupervisorSource {
  readonly start: () => Promise<void>
  readonly stop: () => void
}

export interface SwayLaneEventSupervisorDiagnostic {
  readonly message: string
  readonly error?: unknown
  readonly socketPath?: string
}

export interface SwayLaneEventSupervisor {
  /** Begin the discover -> connect -> watch -> reconnect loop (non-blocking). */
  readonly start: () => void
  /** Tear down the current source and cancel any pending reconnect. */
  readonly stop: () => void
  /** True only while a Sway event source is connected and open. */
  readonly isAvailable: () => boolean
}

const DEFAULT_RETRY_DELAY_MS = 1000

export function createSwayLaneEventSupervisor(options: {
  readonly discover: () => string | undefined
  readonly createSource: (input: {
    readonly socketPath: string
    readonly onStatus: (status: "open" | "closed") => void
  }) => SwayLaneEventSupervisorSource
  readonly onDiagnostic?: (
    diagnostic: SwayLaneEventSupervisorDiagnostic,
  ) => void
  readonly retryDelayMs?: number
  readonly setTimer?: (callback: () => void, ms: number) => unknown
  readonly clearTimer?: (handle: unknown) => void
}): SwayLaneEventSupervisor {
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const setTimer =
    options.setTimer ??
    ((callback: () => void, ms: number) => setTimeout(callback, ms))
  const clearTimer =
    options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as never))

  let available = false
  let running = false
  // Monotonically increasing so callbacks from a superseded source are ignored.
  let generation = 0
  let currentSource: SwayLaneEventSupervisorSource | undefined
  let pendingTimer: unknown

  const diagnostic = (input: SwayLaneEventSupervisorDiagnostic) => {
    options.onDiagnostic?.(input)
  }

  const clearPending = () => {
    if (pendingTimer !== undefined) {
      clearTimer(pendingTimer)
      pendingTimer = undefined
    }
  }

  const teardownCurrent = () => {
    if (currentSource) {
      try {
        currentSource.stop()
      } catch {
        // A source that throws on stop must not wedge the supervisor.
      }
      currentSource = undefined
    }
  }

  const scheduleRetry = () => {
    if (!running) return
    if (pendingTimer !== undefined) return
    pendingTimer = setTimer(() => {
      pendingTimer = undefined
      attempt()
    }, retryDelayMs)
  }

  const attempt = () => {
    if (!running) return
    const socketPath = options.discover()
    if (!socketPath) {
      available = false
      diagnostic({ message: "sway socket not yet discoverable" })
      scheduleRetry()
      return
    }

    const myGeneration = ++generation
    teardownCurrent()

    const source = options.createSource({
      socketPath,
      onStatus: status => {
        if (myGeneration !== generation) return
        if (status === "open") {
          available = true
          return
        }
        available = false
        if (currentSource === source) teardownCurrent()
        scheduleRetry()
      },
    })
    currentSource = source

    const handleStartFailure = (error: unknown) => {
      if (myGeneration !== generation) return
      available = false
      diagnostic({
        message: "sway event source failed to start",
        error,
        socketPath,
      })
      if (currentSource === source) teardownCurrent()
      scheduleRetry()
    }

    // Invoke start() synchronously so a source can report "open" immediately,
    // while still catching both synchronous throws and async rejections.
    try {
      void Promise.resolve(source.start()).catch(handleStartFailure)
    } catch (error) {
      handleStartFailure(error)
    }
  }

  return {
    start() {
      if (running) return
      running = true
      attempt()
    },
    stop() {
      running = false
      // Invalidate any in-flight source callbacks.
      generation++
      clearPending()
      teardownCurrent()
      available = false
    },
    isAvailable: () => available,
  }
}
