/**
 * Desktop preload script: installs `window.__korriConnection` so the
 * renderer can observe connection-state pushes from the bun process.
 *
 * The bun side calls `window.__electrobun.receiveMessageFromBun(payload)`
 * for every connection-state transition. The default electrobun stub just
 * logs to console; this preload overrides it to fan out validated state to
 * subscribers installed by the React shell.
 *
 * Built as a separate browser target via:
 *   bun build korri/deploy/desktop/preload.ts \
 *     --target=browser \
 *     --outfile=out/build/desktop-preload/preload.js
 *
 * and copied into `views/mainview/preload.js` via `electrobun.config.ts`.
 */

import {
  type ConnectionStateBridgeState,
  isConnectionStateBridgeState,
} from "./connection-state-bridge"

declare global {
  interface Window {
    __korriConnection?: KorriConnectionBridge
    __electrobun?: {
      receiveMessageFromBun?: (msg: unknown) => void
      [extension: string]: unknown
    }
  }
}

export interface KorriConnectionBridge {
  getState(): ConnectionStateBridgeState
  subscribe(listener: ConnectionStateListener): () => void
}

export type ConnectionStateListener = (
  state: ConnectionStateBridgeState,
) => void

const INITIAL_STATE: ConnectionStateBridgeState = {
  status: "searching",
  since: new Date(0).toISOString(),
  helpAfter: new Date(0).toISOString(),
}

/**
 * Install the bridge on the given window object. Exposed for tests; the
 * preload entry point at the bottom of this file installs onto the real
 * `window`.
 */
export function installConnectionStateBridge(
  target: Window & typeof globalThis,
): KorriConnectionBridge {
  const listeners = new Set<ConnectionStateListener>()
  let current: ConnectionStateBridgeState = INITIAL_STATE

  const bridge: KorriConnectionBridge = {
    getState: () => current,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  const acceptIncoming = (incoming: unknown): void => {
    if (!isConnectionStateBridgeState(incoming)) return
    current = incoming
    for (const listener of listeners) {
      listener(incoming)
    }
  }

  target.__korriConnection = bridge

  // Electrobun's preload (which runs first) installs a default stub at
  // `window.__electrobun.receiveMessageFromBun`. Override it so connection-
  // state pushes from bun reach our bridge.
  if (!target.__electrobun) {
    target.__electrobun = {}
  }
  target.__electrobun.receiveMessageFromBun = acceptIncoming

  return bridge
}

// In test contexts importers want a fresh bridge; in production the module
// runs as a side-effecting preload, installing once into the host window.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    installConnectionStateBridge(window as Window & typeof globalThis)
  } catch (error) {
    // Preload is best-effort; renderer falls back to a stub when missing.
    console.warn("[korri] preload bridge install failed", error)
  }
}
