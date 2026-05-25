/**
 * Desktop preload script: installs `window.__korriInput` so the renderer can
 * receive brokered semantic input actions (gamepad mappings, directional keys,
 * etc.) pushed by the Bun-side input broker.
 *
 * The Bun side delivers input through Korri's own
 * `window.__korriInputDispatch(payload)` entry point. Electrobun's
 * `window.__electrobun.receiveMessageFromBun` hook remains framework-owned and
 * is intentionally not used for product input delivery.
 *
 * Connection-state and runtime-config no longer cross this boundary — the
 * catch-all serve in `create-desktop-app.ts` gates the React bundle on
 * `connected` and inlines runtime-config into `index.html` directly. See plan
 * 2026-05-24-004 (U1, U2, U6).
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
    __korriInputDispatch?: (payload: unknown) => void
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

  const dispatch = (incoming: unknown): void => {
    if (isDesktopInputActionBridgePayload(incoming)) {
      for (const listener of actionListeners) {
        try {
          listener(incoming.action)
        } catch (error) {
          console.warn("[korri] input action listener threw", error)
        }
      }
      return
    }

    if (isDesktopInputStatusBridgePayload(incoming)) {
      currentStatus = incoming.status
      for (const listener of statusListeners) {
        try {
          listener(incoming.status)
        } catch (error) {
          console.warn("[korri] input status listener threw", error)
        }
      }
    }
  }

  target.__korriInput = bridge
  target.__korriInputDispatch = dispatch

  return bridge
}

// No auto-install side effect: tests import this file directly and must not
// mutate the global window on import. The desktop's compiled preload entry
// point lives in `preload-entry.ts` and calls `installDesktopInputBridge`
// explicitly when bundled for the browser target.
