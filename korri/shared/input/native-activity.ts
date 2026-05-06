export type NativeInputActivityListener = (active: boolean) => void

export interface HttpNativeInputActivityOptions {
  readonly url: string
  readonly intervalMs?: number
  readonly initialActive?: boolean
  readonly fetchImpl?: NativeInputActivityFetch
}

export type NativeInputActivityFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export interface NativeInputActivitySource {
  readonly current: () => boolean
  readonly subscribe: (listener: NativeInputActivityListener) => () => void
}

export interface BrowserNativeInputActivityOptions {
  readonly windowRef?: Pick<Window, "addEventListener" | "removeEventListener">
  readonly documentRef?: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState" | "hasFocus"
  >
}

export function createBrowserNativeInputActivitySource(
  options: BrowserNativeInputActivityOptions = {},
): NativeInputActivitySource {
  const windowRef = options.windowRef ?? globalThis.window
  const documentRef = options.documentRef ?? globalThis.document

  if (!windowRef || !documentRef) return alwaysActiveNativeInputActivitySource

  const current = () =>
    documentRef.visibilityState !== "hidden" && documentRef.hasFocus()

  return {
    current,
    subscribe(listener) {
      const notify = () => listener(current())
      windowRef.addEventListener("focus", notify)
      windowRef.addEventListener("blur", notify)
      documentRef.addEventListener("visibilitychange", notify)

      return () => {
        windowRef.removeEventListener("focus", notify)
        windowRef.removeEventListener("blur", notify)
        documentRef.removeEventListener("visibilitychange", notify)
      }
    },
  }
}

export function createHttpNativeInputActivitySource(
  options: HttpNativeInputActivityOptions,
): NativeInputActivitySource {
  const fetchImpl = options.fetchImpl ?? fetch
  const intervalMs = options.intervalMs ?? 250
  let active = options.initialActive ?? false
  const listeners = new Set<NativeInputActivityListener>()

  const update = (next: boolean) => {
    if (active === next) return
    active = next
    for (const listener of [...listeners]) listener(active)
  }

  const poll = async () => {
    try {
      const response = await fetchImpl(options.url, { cache: "no-store" })
      if (!response.ok) {
        update(false)
        return
      }
      const body = (await response.json()) as { readonly active?: unknown }
      update(body.active === true)
    } catch {
      update(false)
    }
  }

  return {
    current: () => active,
    subscribe(listener) {
      listeners.add(listener)
      void poll()
      const timer = setInterval(() => void poll(), intervalMs)

      return () => {
        clearInterval(timer)
        listeners.delete(listener)
      }
    },
  }
}

export const alwaysActiveNativeInputActivitySource: NativeInputActivitySource =
  {
    current: () => true,
    subscribe: () => () => {},
  }
