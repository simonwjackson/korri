import { useEffect, useRef, useState } from "react"
import type { LauncherBridge } from "../bridge/launcher-bridge"
import type { InputBus } from "../input/bus"
import { LaunchablesList } from "./LaunchablesList"
import { LaunchablesState } from "./state"

interface LaunchablesRootProps {
  readonly bus: InputBus
  readonly bridge: LauncherBridge
}

/**
 * Root of the launchables screen: owns the state ADT, loads from the
 * bridge, and translates semantic input actions into state transitions.
 */
export function LaunchablesRoot({ bus, bridge }: LaunchablesRootProps) {
  const [state, setState] = useState<LaunchablesState>(LaunchablesState.loading)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let cancelled = false
    bridge.queryLaunchables().then(result => {
      if (!cancelled) setState(LaunchablesState.fromQueryResult(result))
    })
    return () => {
      cancelled = true
    }
  }, [bridge])

  useEffect(() => {
    const offDirection = bus.onAction("direction", action => {
      setState(current =>
        LaunchablesState.moveSelection(current, action.direction),
      )
    })
    const offConfirm = bus.onAction("confirm", () => {
      const selected = LaunchablesState.selected(stateRef.current)
      if (selected._tag === "None") return
      bridge.launchApp(selected.value.packageName).then(result => {
        setState(current =>
          LaunchablesState.withLaunchResult(current, result),
        )
      })
    })
    return () => {
      offDirection()
      offConfirm()
    }
  }, [bus, bridge])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      {state._tag === "Loading" && (
        <p className="text-lg text-zinc-400">Loading launchables…</p>
      )}
      {state._tag === "LoadError" && (
        <div className="space-y-2 text-center">
          <p className="text-xl font-semibold text-red-400">
            Couldn't load launchables
          </p>
          <p className="text-zinc-400">{state.message}</p>
        </div>
      )}
      {state._tag === "Ready" && <LaunchablesList state={state} />}
    </main>
  )
}
