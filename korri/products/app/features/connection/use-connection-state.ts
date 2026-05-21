import {
  type ConnectionStateBridgeState,
  isConnectionStateBridgeState,
} from "../../../../deploy/desktop/connection-state-bridge"
import { useSyncExternalStore } from "react"

interface KorriConnectionBridge {
  getState(): ConnectionStateBridgeState
  subscribe(listener: (state: ConnectionStateBridgeState) => void): () => void
}

declare global {
  interface Window {
    __korriConnection?: KorriConnectionBridge
  }
}

/**
 * Stub state for contexts that don't run the desktop preload (portal
 * deploy, Storybook, unit tests). The stub is "connected" so the gate
 * never blocks rendering outside of the desktop runtime.
 */
const PORTAL_STUB_STATE: ConnectionStateBridgeState = {
  status: "connected",
  server: { hostId: "portal", controlUrl: "" },
}

function getSnapshot(): ConnectionStateBridgeState {
  if (typeof window === "undefined") return PORTAL_STUB_STATE
  const bridge = window.__korriConnection
  if (!bridge) return PORTAL_STUB_STATE
  const value = bridge.getState()
  return isConnectionStateBridgeState(value) ? value : PORTAL_STUB_STATE
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const bridge = window.__korriConnection
  if (!bridge) return () => {}
  return bridge.subscribe(() => listener())
}

/**
 * Subscribe to the desktop preload's connection-state bridge. Returns
 * `connected` to the portal stub when the bridge is missing.
 */
export function useConnectionState(): ConnectionStateBridgeState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export type { ConnectionStateBridgeState }
