/**
 * Desktop preload script: installs `window.__korriInput` so the
 * renderer can receive brokered semantic input actions (gamepad
 * mappings, directional keys, etc.) pushed by the bun-side input
 * broker.
 *
 * The bun side calls `window.__electrobun.receiveMessageFromBun(payload)`
 * with input payloads tagged by `kind`; the installer below dispatches
 * by tag. `chainAcceptor` preserves any previously-installed handler
 * so coexistence with electrobun's own preload (or any future
 * additional bridge) is non-destructive.
 *
 * Connection-state and runtime-config no longer cross this boundary —
 * the catch-all serve in `create-desktop-app.ts` gates the React
 * bundle on `connected` and inlines runtime-config into `index.html`
 * directly. See plan 2026-05-24-004 (U1, U2, U6).
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

declare global {
  interface Window {
    __korriInput?: KorriInputBridge
    __electrobun?: {
      receiveMessageFromBun?: (msg: unknown) => void
      [extension: string]: unknown
    }
  }
}

export interface KorriInputBridge {
  subscribeAction(listener: InputActionListener): () => void
  getStatus(): DesktopInputStatus
  subscribeStatus(listener: InputStatusListener): () => void
}

export type InputActionListener = (action: DesktopInputAction) => void
export type InputStatusListener = (status: DesktopInputStatus) => void

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
 * preserving any previously-installed handler. Both run for every
 * message; each is responsible for filtering by its own type guard.
 *
 * Each handler is isolated by try/catch so a throw from one bridge
 * (e.g., a subscriber raising) does not poison the chain for the next
 * bridge. This isolation property is load-bearing for coexistence with
 * electrobun's own preload and is regression-tested directly in
 * `preload.test.ts`.
 */
export function chainAcceptor(
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
 * Install the desktop-input bridge on the given window object. Actions
 * are edge-triggered and not replayed; status is a replayable snapshot.
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

// No auto-install side effect: tests import this file directly and
// must not mutate the global window on import. The desktop's compiled
// preload entry point lives in `preload-entry.ts` and calls
// `installDesktopInputBridge` explicitly when bundled for the browser
// target.
