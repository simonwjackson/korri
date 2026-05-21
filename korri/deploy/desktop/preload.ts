/**
 * Desktop preload script: installs `window.__korriConnection` and
 * `window.__korriRuntime` so the renderer can observe pushes from the bun
 * process.
 *
 * The bun side calls `window.__electrobun.receiveMessageFromBun(payload)`
 * for every push. Each installer here chains the existing handler rather
 * than replacing it, so both bridges receive every message and each
 * filters by its own type guard. Install order is irrelevant.
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
import {
  isRuntimeConfigBridgeState,
  type RuntimeConfigBridgeState,
} from "./runtime-config-bridge"

declare global {
  interface Window {
    __korriConnection?: KorriConnectionBridge
    __korriRuntime?: KorriRuntimeBridge
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

export interface KorriRuntimeBridge {
  getState(): RuntimeConfigBridgeState
  subscribe(listener: RuntimeConfigListener): () => void
}

export type RuntimeConfigListener = (state: RuntimeConfigBridgeState) => void

const INITIAL_STATE: ConnectionStateBridgeState = {
  status: "searching",
  since: new Date(0).toISOString(),
  helpAfter: new Date(0).toISOString(),
}

const INITIAL_RUNTIME_STATE: RuntimeConfigBridgeState = {
  nativeBridgeUrl: null,
}

/**
 * Chain a new acceptor onto `target.__electrobun.receiveMessageFromBun`,
 * preserving any previously-installed handler. Both run for every message;
 * each is responsible for filtering by its own type guard.
 */
function chainAcceptor(
  target: Window & typeof globalThis,
  accept: (incoming: unknown) => void,
): void {
  if (!target.__electrobun) {
    target.__electrobun = {}
  }
  const previous = target.__electrobun.receiveMessageFromBun
  target.__electrobun.receiveMessageFromBun = (incoming: unknown): void => {
    if (typeof previous === "function") {
      previous(incoming)
    }
    accept(incoming)
  }
}

/**
 * Install the connection-state bridge on the given window object. Exposed
 * for tests; the preload entry point installs onto the real `window`.
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
  chainAcceptor(target, acceptIncoming)

  return bridge
}

/**
 * Install the runtime-config bridge on the given window object. Exposed
 * for tests; the preload entry point installs onto the real `window`.
 */
export function installRuntimeBridge(
  target: Window & typeof globalThis,
): KorriRuntimeBridge {
  const listeners = new Set<RuntimeConfigListener>()
  let current: RuntimeConfigBridgeState = INITIAL_RUNTIME_STATE

  const bridge: KorriRuntimeBridge = {
    getState: () => current,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  const acceptIncoming = (incoming: unknown): void => {
    if (!isRuntimeConfigBridgeState(incoming)) return
    current = incoming
    for (const listener of listeners) {
      listener(incoming)
    }
  }

  target.__korriRuntime = bridge
  chainAcceptor(target, acceptIncoming)

  return bridge
}

// No auto-install side effect: tests import this file directly and must
// not mutate the global window on import. The desktop's compiled preload
// entry point lives in `preload-entry.ts` and calls
// `installConnectionStateBridge` explicitly when bundled for the
// browser target.
