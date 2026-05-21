import type { ConnectionState } from "./connection"
import type { ConnectionStateBridgeState } from "./connection-state-bridge"

/**
 * Convert the bun-side `ConnectionState` (whose timestamps are `Date`
 * objects) to the wire-format `ConnectionStateBridgeState` (whose
 * timestamps are ISO strings). JSON has no native Date type, so the
 * preload bridge always works with strings.
 */
export function toBridgeState(
  state: ConnectionState,
): ConnectionStateBridgeState {
  if (state.status === "connected") {
    return { status: "connected", server: state.server }
  }
  if (state.status === "reconnecting") {
    return {
      status: "reconnecting",
      server: state.server,
      since: state.since.toISOString(),
      helpAfter: state.helpAfter.toISOString(),
    }
  }
  return {
    status: "searching",
    since: state.since.toISOString(),
    helpAfter: state.helpAfter.toISOString(),
  }
}
