import { useCallback, useEffect, useRef, useState } from "react"
import { SHELL_RESUMED_EVENT } from "@contracts/bridge/korri-native-bridge"
import type { LauncherBridge } from "../bridge/launcher-bridge"
import type { InputBus } from "../input/bus"
import { LaunchablesList } from "./LaunchablesList"
import { LaunchablesState, type StreamSource } from "./state"

interface LaunchablesRootProps {
  readonly bus: InputBus
  readonly bridge: LauncherBridge
}

/**
 * Root of the launchables screen: owns the state ADT, loads both sources
 * (device apps and paired hosts' stream apps), and translates semantic
 * input actions into state transitions.
 */
export function LaunchablesRoot({ bus, bridge }: LaunchablesRootProps) {
  const [state, setState] = useState<LaunchablesState>(LaunchablesState.loading)
  const stateRef = useRef(state)
  stateRef.current = state

  const load = useCallback(async () => {
    setState(LaunchablesState.loading())
    const local = await bridge.queryLaunchables()
    const hostsResult = await bridge.queryStreamHosts()
    const streams: readonly StreamSource[] =
      hostsResult._tag === "StreamHosts"
        ? await Promise.all(
            hostsResult.items
              .filter(host => host.paired)
              .map(async host => ({
                host,
                apps: await bridge.queryStreamApps(host.uuid),
              })),
          )
        : []
    setState(
      LaunchablesState.fromSources(
        local,
        streams,
        hostsResult._tag === "QueryFailed" ? hostsResult.message : undefined,
      ),
    )
  }, [bridge])

  useEffect(() => {
    void load()
  }, [load])

  // Returning from a stream (or any shell resume): state may be stale.
  useEffect(() => {
    const onResumed = () => void load()
    window.addEventListener(SHELL_RESUMED_EVENT, onResumed)
    return () => window.removeEventListener(SHELL_RESUMED_EVENT, onResumed)
  }, [load])

  useEffect(() => {
    const offDirection = bus.onAction("direction", action => {
      setState(current =>
        LaunchablesState.moveSelection(current, action.direction),
      )
    })
    const offConfirm = bus.onAction("confirm", () => {
      const selected = LaunchablesState.selected(stateRef.current)
      if (selected._tag === "None") return
      const entry = selected.value
      if (entry.kind === "local") {
        void bridge.launchApp(entry.launchable.packageName).then(result => {
          setState(current =>
            LaunchablesState.withLaunchResult(current, result),
          )
        })
      } else {
        void bridge.startStream(entry.hostUuid, entry.app.id).then(result => {
          setState(current =>
            LaunchablesState.withStartStreamResult(current, result),
          )
        })
      }
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
