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
      const bridge = options.bridge ?? globalDesktopInputBridge()
      if (!bridge) return () => {}

      return bridge.subscribeAction(action => emit(action))
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
