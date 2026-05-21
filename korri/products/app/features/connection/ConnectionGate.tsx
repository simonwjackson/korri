import type { ReactNode } from "react"
import { SearchingState } from "./SearchingState"
import { useConnectionState } from "./use-connection-state"

/**
 * Wraps the routed app tree. Renders children only when the desktop is
 * `connected` to a korri-server. Otherwise renders the full-screen
 * SearchingState. Outside the desktop (portal, Storybook, tests) the hook
 * returns a `connected` stub so the gate never blocks rendering.
 */
export function ConnectionGate({ children }: { readonly children: ReactNode }) {
  const state = useConnectionState()
  if (state.status === "connected") return <>{children}</>
  return <SearchingState state={state} />
}
