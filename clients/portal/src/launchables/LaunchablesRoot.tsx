import { useCallback, useEffect, useRef, useState } from "react"
import { SHELL_RESUMED_EVENT } from "@contracts/bridge/korri-native-bridge"
import type { LauncherBridge } from "../bridge/launcher-bridge"
import type { KorridClient } from "../korrid/client"
import type { InputBus } from "../input/bus"
import { LaunchablesList } from "./LaunchablesList"
import { LaunchablesState, type StreamSource } from "./state"

/**
 * The stable Sunshine app every prepared game streams through. korrid's
 * prepare step arms the host so that attaching to this app runs the
 * selected game; per-game Sunshine entries are legacy scaffolding.
 */
const KORRI_STREAM_APP = "Korri Stream"

interface LaunchablesRootProps {
  readonly bus: InputBus
  readonly bridge: LauncherBridge
  readonly korrid: KorridClient
}

/**
 * Root of the launchables screen: owns the state ADT, loads all sources
 * (korrid games, device apps, paired hosts' stream apps), and translates
 * semantic input actions into state transitions.
 */
export function LaunchablesRoot({ bus, bridge, korrid }: LaunchablesRootProps) {
  const [state, setState] = useState<LaunchablesState>(LaunchablesState.loading)
  const stateRef = useRef(state)
  stateRef.current = state
  const streamsRef = useRef<readonly StreamSource[]>([])

  const load = useCallback(async () => {
    setState(LaunchablesState.loading())
    const [local, games, hostsResult, session] = await Promise.all([
      bridge.queryLaunchables(),
      korrid.catalogSnapshot(),
      bridge.queryStreamHosts(),
      korrid.sessionStatus(),
    ])
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
    streamsRef.current = streams
    setState(
      LaunchablesState.fromSources(
        local,
        streams,
        games,
        hostsResult._tag === "QueryFailed" ? hostsResult.message : undefined,
        session,
      ),
    )
  }, [bridge, korrid])

  useEffect(() => {
    void load()
  }, [load])

  // Returning from a stream (or any shell resume): state may be stale.
  useEffect(() => {
    const onResumed = () => void load()
    window.addEventListener(SHELL_RESUMED_EVENT, onResumed)
    return () => window.removeEventListener(SHELL_RESUMED_EVENT, onResumed)
  }, [load])

  /** Locate the stable stream app among the loaded Sunshine sources. */
  const findKorriStreamTarget = () => {
    for (const source of streamsRef.current) {
      if (source.apps._tag !== "StreamApps") continue
      const app = source.apps.items.find(app => app.name === KORRI_STREAM_APP)
      if (app) return { hostUuid: source.host.uuid, appId: app.id }
    }
    return null
  }

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
      if (entry.kind === "now-playing") {
        // Resume: the host session is already prepared — attach straight
        // to the stable stream app without re-preparing.
        const target = findKorriStreamTarget()
        if (target === null) {
          setState(current =>
            LaunchablesState.withStartStreamResult(current, {
              _tag: "StreamFailed",
              reason: "AppNotFound",
              message: `no "${KORRI_STREAM_APP}" app on a paired host`,
            }),
          )
          return
        }
        void bridge.startStream(target.hostUuid, target.appId).then(result => {
          setState(current =>
            LaunchablesState.withStartStreamResult(current, result),
          )
        })
      } else if (entry.kind === "local") {
        void bridge.launchApp(entry.launchable.packageName).then(result => {
          setState(current =>
            LaunchablesState.withLaunchResult(current, result),
          )
        })
      } else if (entry.kind === "stream") {
        void bridge.startStream(entry.hostUuid, entry.app.id).then(result => {
          setState(current =>
            LaunchablesState.withStartStreamResult(current, result),
          )
        })
      } else {
        // The Korri launch model: brain prepares the game, then the shell
        // attaches to the stable stream app that now embodies it. Preparing
        // is visible immediately so there is no dead gap before the swap.
        setState(current =>
          LaunchablesState.beginPreparing(current, entry.game.title),
        )
        void korrid.sessionPrepare(entry.game.id).then(async outcome => {
          if (outcome._tag !== "Ok") {
            setState(current =>
              LaunchablesState.withPrepareOutcome(current, outcome),
            )
            return
          }
          const target = findKorriStreamTarget()
          if (target === null) {
            setState(current =>
              LaunchablesState.withPrepareOutcome(current, {
                _tag: "Err",
                payload: {
                  code: "NoStreamTarget",
                  message: `no "${KORRI_STREAM_APP}" app on a paired host`,
                },
              }),
            )
            return
          }
          const result = await bridge.startStream(target.hostUuid, target.appId)
          setState(current =>
            LaunchablesState.withStartStreamResult(current, result),
          )
        })
      }
    })
    // Stop lives on the existing semantic vocabulary: "options" on the
    // now-playing banner asks korrid to stop the host session, then
    // reloads so the banner reflects the outcome truthfully.
    const offOptions = bus.onAction("options", () => {
      const selected = LaunchablesState.selected(stateRef.current)
      if (selected._tag === "None" || selected.value.kind !== "now-playing")
        return
      void korrid.sessionStop().then(outcome => {
        setState(current => LaunchablesState.withStopOutcome(current, outcome))
        if (outcome._tag === "Ok") void load()
      })
    })
    return () => {
      offDirection()
      offConfirm()
      offOptions()
    }
  }, [bus, bridge, korrid, load])

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
      {state._tag === "Ready" && state.preparing !== null && (
        <div className="space-y-2 text-center">
          <p className="text-xl font-semibold">Preparing {state.preparing}…</p>
          <p className="text-zinc-400">Your stream will start in a moment</p>
        </div>
      )}
      {state._tag === "Ready" && state.preparing === null && (
        <LaunchablesList state={state} />
      )}
    </main>
  )
}
