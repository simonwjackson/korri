import type { InputAdapter, InputListener } from "./types"

export interface DesktopInputBridgeLike {
  subscribeAction(listener: InputListener): () => void
}

export interface DesktopBridgeAdapterOptions {
  readonly bridge?: DesktopInputBridgeLike
}

export function createDesktopBridgeAdapter(
  options: DesktopBridgeAdapterOptions = {},
): InputAdapter {
  return {
    name: "desktop-bridge",
    start(emit: InputListener) {
      let disposed = false
      let unsubscribe: (() => void) | undefined
      let retryTimer: ReturnType<typeof setInterval> | undefined

      const subscribe = () => {
        if (disposed || unsubscribe) return
        const bridge = options.bridge ?? globalDesktopInputBridge()
        if (!bridge) return

        unsubscribe = bridge.subscribeAction(action => emit(action))
        if (retryTimer) {
          clearInterval(retryTimer)
          retryTimer = undefined
        }
      }

      subscribe()
      if (!unsubscribe && !options.bridge) {
        retryTimer = setInterval(subscribe, 100)
      }

      return () => {
        disposed = true
        if (retryTimer) clearInterval(retryTimer)
        unsubscribe?.()
      }
    },
  }
}

function globalDesktopInputBridge(): DesktopInputBridgeLike | undefined {
  if (typeof window === "undefined") return undefined
  const candidate = (window as Window & { __korriInput?: unknown }).__korriInput
  return isDesktopInputBridgeLike(candidate) ? candidate : undefined
}

function isDesktopInputBridgeLike(
  value: unknown,
): value is DesktopInputBridgeLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "subscribeAction" in value &&
    typeof value.subscribeAction === "function"
  )
}
