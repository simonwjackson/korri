import { useEffect, useState } from "react"
import type { ConnectionStateBridgeState } from "./use-connection-state"

interface SearchingStateProps {
  readonly state: Exclude<
    ConnectionStateBridgeState,
    { readonly status: "connected" }
  >
}

/**
 * Full-screen "searching for korri-server" UI. Renders while the desktop
 * connection controller is in a pre-connected status. Help text appears
 * after the `helpAfter` moment carried by the controller's state.
 */
export function SearchingState({ state }: SearchingStateProps) {
  const helpVisible = useHelpVisible(state.helpAfter)
  const title =
    state.status === "reconnecting"
      ? `Looking for ${state.server.hostId}…`
      : "Looking for a Korri server…"

  return (
    <div
      role="status"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 text-slate-100"
      data-testid="searching-state"
      data-status={state.status}
    >
      <div className="text-3xl font-semibold">{title}</div>
      <div className="text-sm text-slate-400">
        Make sure Ethernet is connected and a Korri server is running on the
        same network.
      </div>
      {helpVisible ? <SearchingStateHelp /> : null}
    </div>
  )
}

function SearchingStateHelp() {
  return (
    <div
      data-testid="searching-state-help"
      className="max-w-md rounded-md border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300"
    >
      Still searching. Confirm the wired network is connected and that a Korri
      server is reachable on this network, then try again.
    </div>
  )
}

function useHelpVisible(helpAfterIso: string): boolean {
  const helpAfter = parseHelpAfter(helpAfterIso)
  const [visible, setVisible] = useState(() => Date.now() >= helpAfter)

  useEffect(() => {
    if (visible) return
    const remaining = helpAfter - Date.now()
    if (remaining <= 0) {
      setVisible(true)
      return
    }
    const id = setTimeout(() => setVisible(true), remaining)
    return () => {
      clearTimeout(id)
    }
  }, [helpAfter, visible])

  return visible
}

function parseHelpAfter(iso: string): number {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}
