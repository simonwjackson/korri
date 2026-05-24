/**
 * Polling loop for the bun-served waiting page.
 *
 * The waiting page is a single static document. It cannot subscribe to
 * the connection controller — there is no IPC channel, by design. So it
 * polls `/__korri/desktop/connection-status` on a steady cadence and
 * reloads when the controller reports `connected`. After the reload,
 * bun's catch-all serves the React bundle (connection state has flipped)
 * and the waiting page is gone.
 *
 * All transient errors (network, malformed JSON, HTTP 5xx) keep the loop
 * scheduled; only an authoritative `status === "connected"` response
 * triggers `reload()`. Errors are swallowed quietly: there is no UI to
 * report them to (the page is intentionally minimal) and the next tick
 * will retry.
 *
 * Primitives are injected so the loop can be exercised by a unit test
 * without happy-dom or a real `setInterval` / `fetch` — see
 * `polling-loop.test.ts`.
 */

export interface CreatePollingLoopOptions {
  readonly fetch: (input: RequestInfo | URL) => Promise<Response>
  readonly reload: () => void
  readonly setInterval: typeof setInterval
  readonly clearInterval: typeof clearInterval
  readonly url: string
  readonly intervalMs: number
}

export interface PollingLoop {
  start(): void
  dispose(): void
}

export function createPollingLoop(
  options: CreatePollingLoopOptions,
): PollingLoop {
  let handle: ReturnType<typeof setInterval> | undefined
  let stopped = false

  const tick = async (): Promise<void> => {
    try {
      const response = await options.fetch(options.url)
      if (!response.ok) return
      const text = await response.text()
      const parsed: unknown = JSON.parse(text)
      if (isConnected(parsed)) {
        options.reload()
      }
    } catch {
      // Transient: malformed JSON, network drop, fetch reject. Next
      // tick retries. Nothing to surface from this static page.
    }
  }

  return {
    start: () => {
      if (handle !== undefined || stopped) return
      handle = options.setInterval(() => {
        void tick()
      }, options.intervalMs)
    },
    dispose: () => {
      stopped = true
      if (handle !== undefined) {
        options.clearInterval(handle)
        handle = undefined
      }
    },
  }
}

function isConnected(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "connected"
  )
}
