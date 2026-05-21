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
  type DesktopInputAction,
  type DesktopInputStatus,
  isDesktopInputActionBridgePayload,
  isDesktopInputStatusBridgePayload,
} from "@shared/input/desktop-bridge-wire"
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
    __korriInput?: KorriInputBridge
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

export interface KorriInputBridge {
  subscribeAction(listener: InputActionListener): () => void
  getStatus(): DesktopInputStatus
  subscribeStatus(listener: InputStatusListener): () => void
}

export type InputActionListener = (action: DesktopInputAction) => void
export type InputStatusListener = (status: DesktopInputStatus) => void

const INITIAL_STATE: ConnectionStateBridgeState = {
  status: "searching",
  since: new Date(0).toISOString(),
  helpAfter: new Date(0).toISOString(),
}

const INITIAL_RUNTIME_STATE: RuntimeConfigBridgeState = {
  desktopInput: false,
}

const INITIAL_INPUT_STATUS: DesktopInputStatus = {
  inputd: "disabled",
  active: false,
  decodedFrames: 0,
  emittedActions: 0,
  droppedActions: 0,
  pushFailures: 0,
  lastError: null,
}

/**
 * Chain a new acceptor onto `target.__electrobun.receiveMessageFromBun`,
 * preserving any previously-installed handler. Both run for every message;
 * each is responsible for filtering by its own type guard.
 *
 * Each handler is isolated by try/catch so a throw from one bridge (e.g.,
 * a subscriber raising) does not poison the chain for the next bridge.
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
      try {
        previous(incoming)
      } catch (error) {
        console.warn("[korri] prior bridge acceptor threw", error)
      }
    }
    try {
      accept(incoming)
    } catch (error) {
      console.warn("[korri] bridge acceptor threw", error)
    }
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

/**
 * Install the desktop-input bridge on the given window object. Actions are
 * edge-triggered and not replayed; status is a replayable snapshot.
 */
export function installDesktopInputBridge(
  target: Window & typeof globalThis,
): KorriInputBridge {
  const actionListeners = new Set<InputActionListener>()
  const statusListeners = new Set<InputStatusListener>()
  let currentStatus: DesktopInputStatus = INITIAL_INPUT_STATUS

  const bridge: KorriInputBridge = {
    subscribeAction: listener => {
      actionListeners.add(listener)
      return () => {
        actionListeners.delete(listener)
      }
    },
    getStatus: () => currentStatus,
    subscribeStatus: listener => {
      statusListeners.add(listener)
      return () => {
        statusListeners.delete(listener)
      }
    },
  }

  const acceptIncoming = (incoming: unknown): void => {
    if (isDesktopInputActionBridgePayload(incoming)) {
      for (const listener of actionListeners) {
        listener(incoming.action)
      }
      return
    }

    if (isDesktopInputStatusBridgePayload(incoming)) {
      currentStatus = incoming.status
      for (const listener of statusListeners) {
        listener(incoming.status)
      }
    }
  }

  target.__korriInput = bridge
  chainAcceptor(target, acceptIncoming)

  return bridge
}

// No auto-install side effect: tests import this file directly and must
// not mutate the global window on import. The desktop's compiled preload
// entry point lives in `preload-entry.ts` and calls
// `installConnectionStateBridge` explicitly when bundled for the
// browser target.
