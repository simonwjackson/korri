export type NativeInputActivityListener = (active: boolean) => void

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

export const alwaysActiveNativeInputActivitySource: NativeInputActivitySource =
  {
    current: () => true,
    subscribe: () => () => {},
  }
