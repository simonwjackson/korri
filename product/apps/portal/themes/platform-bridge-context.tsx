import type { KorriPlatformBridge } from "@platform/theme/bridge"
import { createContext, type ReactNode, useContext } from "react"

const PlatformBridgeContext = createContext<KorriPlatformBridge | null>(null)

export function PlatformBridgeProvider({
  bridge,
  children,
}: {
  readonly bridge: KorriPlatformBridge
  readonly children: ReactNode
}) {
  return (
    <PlatformBridgeContext.Provider value={bridge}>
      {children}
    </PlatformBridgeContext.Provider>
  )
}

export function usePlatformBridge(): KorriPlatformBridge {
  const bridge = useContext(PlatformBridgeContext)
  if (!bridge) {
    throw new Error("Platform bridge is not installed at the portal root")
  }
  return bridge
}
