/**
 * Cross-context contract for the desktop's connection-state push.
 *
 * The bun side (`main.ts`) reads from the connection controller's
 * SubscriptionRef and pushes each transition into open BrowserWindows via
 * electrobun's bun→webview channel. The preload installs a small bridge on
 * `window.__korriConnection` exposing `getState()` / `subscribe()`; the
 * renderer's `useConnectionState` hook subscribes via that surface.
 *
 * This module is the single source of truth for the state shape both sides
 * agree on. It must not import anything that ties it to a runtime
 * (bun-only modules, React, etc.) so it can be safely consumed from both
 * the preload and the React renderer.
 */

export interface ConnectionServerRecord {
  readonly hostId: string
  readonly controlUrl: string
}

export type ConnectionStateBridgeState =
  | {
      readonly status: "searching"
      readonly since: string
      readonly helpAfter: string
    }
  | {
      readonly status: "reconnecting"
      readonly server: ConnectionServerRecord
      readonly since: string
      readonly helpAfter: string
    }
  | {
      readonly status: "connected"
      readonly server: ConnectionServerRecord
    }

/**
 * Type guard for the wire-format state. Dates are serialized as ISO strings
 * — JSON doesn't have a native Date type — so the bridge keeps them as
 * strings to avoid double-conversion ambiguity.
 */
export function isConnectionStateBridgeState(
  value: unknown,
): value is ConnectionStateBridgeState {
  if (!isObject(value)) return false
  const status = value.status
  if (status === "searching") {
    return isString(value.since) && isString(value.helpAfter)
  }
  if (status === "reconnecting") {
    return (
      isString(value.since) &&
      isString(value.helpAfter) &&
      isServerRecord(value.server)
    )
  }
  if (status === "connected") {
    return isServerRecord(value.server)
  }
  return false
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isServerRecord(value: unknown): value is ConnectionServerRecord {
  if (!isObject(value)) return false
  return isString(value.hostId) && isString(value.controlUrl)
}
