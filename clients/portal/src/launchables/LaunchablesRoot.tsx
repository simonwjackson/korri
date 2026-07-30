import { useCallback, useEffect, useRef, useState } from "react"
import { SHELL_RESUMED_EVENT } from "@contracts/bridge/korri-native-bridge"
import type { LauncherBridge } from "../bridge/launcher-bridge"
import type { KorridClient } from "../korrid/client"
import type { InputBus } from "../input/bus"
import { LaunchablesList } from "./LaunchablesList"
import {
  entryLabel,
  KORRI_STREAM_APP,
  LaunchablesState,
  type StreamSource,
} from "./state"

/**
 * The now-playing banner is garnish, not core content: a slow or hung
 * status query must not hold the whole list hostage. Past this deadline
 * the status degrades to the same silent no-banner path as a failure.
 */
const SESSION_STATUS_TIMEOUT_MS = 3000
const STOP_POLL_INTERVAL_MS = 500
const STOP_POLL_DEADLINE_MS = 8000

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

  const loadSeq = useRef(0)
  const actionSeq = useRef(0)
  const stopPollSeq = useRef(0)
  const mountedRef = useRef(true)

  const sessionStatusWithTimeout = useCallback(
    () => korrid.sessionStatus(SESSION_STATUS_TIMEOUT_MS),
    [korrid],
  )

  const load = useCallback(async () => {
    const preservingStop = stateRef.current._tag === "Stopping"
    if (!preservingStop) {
      // A normal full reload supersedes pending UI work. A reload while
      // Stopping is observational only and must not cancel the stop poll.
      actionSeq.current += 1
      stopPollSeq.current += 1
      const loading = LaunchablesState.loading()
      stateRef.current = loading
      setState(loading)
    }
    // Overlapping loads: only the latest invocation may write state.
    const seq = ++loadSeq.current
    const [local, games, localGames, hostsResult, session, storage] =
      await Promise.all([
        bridge.queryLaunchables(),
        korrid.catalogSnapshot(),
        korrid.localGames(),
        bridge.queryStreamHosts(),
        sessionStatusWithTimeout(),
        // Re-read on every load so returning from system settings clears the
        // prompt without the user restarting Korri.
        bridge.storageAccess(),
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
    if (!mountedRef.current || seq !== loadSeq.current) return
    streamsRef.current = streams
    const loaded = LaunchablesState.fromSources(
      local,
      streams,
      games,
      hostsResult._tag === "QueryFailed" ? hostsResult.message : undefined,
      session,
      localGames,
      storage,
    )
    const current = stateRef.current
    if (current._tag === "Stopping") {
      const active = session._tag === "Ok" ? session.payload.active : undefined
      // Preserve Stopping while the same launch remains active (or status
      // is unavailable). Idle or a different launch resolves this stop.
      if (session._tag !== "Ok" || active?.launchId === current.launchId) return
      // This reload established that the target launch ended. Invalidate a
      // late stop ACK as well as any poll before publishing fresh state.
      actionSeq.current += 1
      stopPollSeq.current += 1
    }
    stateRef.current = loaded
    setState(loaded)
  }, [bridge, korrid, sessionStatusWithTimeout])

  useEffect(() => {
    mountedRef.current = true
    void load()
    return () => {
      mountedRef.current = false
      actionSeq.current += 1
      stopPollSeq.current += 1
    }
  }, [load])

  // Returning from a stream (or any shell resume): state may be stale.
  useEffect(() => {
    const onResumed = () => void load()
    window.addEventListener(SHELL_RESUMED_EVENT, onResumed)
    return () => window.removeEventListener(SHELL_RESUMED_EVENT, onResumed)
  }, [load])

  /** Locate the stable app, constrained to the prepared game's host. */
  const findKorriStreamTarget = (hostName?: string) =>
    LaunchablesState.korriStreamTarget(streamsRef.current, hostName)

  useEffect(() => {
    const offDirection = bus.onAction("direction", action => {
      const next = LaunchablesState.moveSelection(
        stateRef.current,
        action.direction,
      )
      stateRef.current = next
      setState(next)
    })
    // A tap says which entry was chosen. Move selection there, then take the
    // ordinary confirm path — the bus dispatches synchronously, so the
    // confirm listener below reads the selection this just set.
    const offActivate = bus.onAction("activate", action => {
      const next = LaunchablesState.selectIndex(stateRef.current, action.index)
      stateRef.current = next
      setState(next)
      bus.emit({ type: "confirm", source: action.source })
    })
    const offConfirm = bus.onAction("confirm", () => {
      const current = stateRef.current
      // selected() only accepts Ready, so Preparing/Stopping are input-
      // locked by the model rather than by a nullable flag convention.
      const selected = LaunchablesState.selected(current)
      if (selected._tag === "None") return
      const entry = selected.value
      const operation = ++actionSeq.current
      if (entry.kind === "pairing") {
        // Native owns pairing: it exchanges a PIN and stores certificates.
        void bridge.openPairing().then(result => {
          if (!mountedRef.current || operation !== actionSeq.current) return
          if (result._tag === "Unavailable") {
            const now = stateRef.current
            if (now._tag !== "Ready") return
            const next = LaunchablesState.withNotice(
              now,
              `cannot open pairing: ${result.message}`,
            )
            stateRef.current = next
            setState(next)
          }
        })
      } else if (entry.kind === "storage-access") {
        // The shell can only take the user to the system screen; it cannot
        // grant anything. Whether they said yes is discovered on resume,
        // when the sources are re-read.
        void bridge.openStorageAccessSettings().then(result => {
          if (!mountedRef.current || operation !== actionSeq.current) return
          if (result._tag === "Unavailable") {
            const current = stateRef.current
            if (current._tag !== "Ready") return
            const next = LaunchablesState.withNotice(
              current,
              `cannot open settings: ${result.message}`,
            )
            stateRef.current = next
            setState(next)
          }
        })
      } else if (entry.kind === "now-playing") {
        // Resume: the host session is already prepared — attach straight
        // to the stable stream app without re-preparing.
        const launching = LaunchablesState.beginLaunching(
          current,
          entryLabel(entry),
        )
        stateRef.current = launching
        setState(launching)
        const target = findKorriStreamTarget(entry.session.host)
        if (target._tag === "None") {
          const failed = LaunchablesState.withStartStreamResult(launching, {
            _tag: "StreamFailed",
            reason: "AppNotFound",
            message: `no "${KORRI_STREAM_APP}" app on a paired host`,
          })
          stateRef.current = failed
          setState(failed)
          return
        }
        void bridge
          .startStream(target.value.hostUuid, target.value.appId)
          .then(result => {
            if (!mountedRef.current || operation !== actionSeq.current) return
            const next = LaunchablesState.withStartStreamResult(
              launching,
              result,
            )
            stateRef.current = next
            setState(next)
          })
      } else if (entry.kind === "local-game") {
        const launching = LaunchablesState.beginLaunching(
          current,
          entryLabel(entry),
        )
        stateRef.current = launching
        setState(launching)
        void korrid.localGameLaunch(entry.game.id).then(async outcome => {
          if (!mountedRef.current || operation !== actionSeq.current) return
          if (outcome._tag !== "Ok") {
            const failed = LaunchablesState.withLocalLaunchOutcome(
              launching,
              outcome,
            )
            stateRef.current = failed
            setState(failed)
            return
          }
          const result = await bridge.launchLocal(outcome.payload)
          if (!mountedRef.current || operation !== actionSeq.current) return
          const next = LaunchablesState.withLocalLaunchResult(
            launching,
            result,
          )
          stateRef.current = next
          setState(next)
        })
      } else if (entry.kind === "local") {
        const launching = LaunchablesState.beginLaunching(
          current,
          entryLabel(entry),
        )
        stateRef.current = launching
        setState(launching)
        void bridge.launchApp(entry.launchable.packageName).then(result => {
          if (!mountedRef.current || operation !== actionSeq.current) return
          const next = LaunchablesState.withLaunchResult(launching, result)
          stateRef.current = next
          setState(next)
        })
      } else if (entry.kind === "stream") {
        const launching = LaunchablesState.beginLaunching(
          current,
          entryLabel(entry),
        )
        stateRef.current = launching
        setState(launching)
        void bridge.startStream(entry.hostUuid, entry.app.id).then(result => {
          if (!mountedRef.current || operation !== actionSeq.current) return
          const next = LaunchablesState.withStartStreamResult(launching, result)
          stateRef.current = next
          setState(next)
        })
      } else {
        // Never arm a host unless the shell can attach to that exact host.
        // Otherwise prepare would leave an unmanaged game running unseen.
        const target = findKorriStreamTarget(entry.game.host)
        if (target._tag === "None") {
          const preparing = LaunchablesState.beginPreparing(
            current,
            entry.game.title,
          )
          const failed = LaunchablesState.withPrepareOutcome(preparing, {
            _tag: "Err",
            payload: {
              code: "NoStreamTarget",
              message:
                entry.game.host === undefined
                  ? `no "${KORRI_STREAM_APP}" app on a paired host`
                  : `no "${KORRI_STREAM_APP}" app on paired host ${entry.game.host}`,
            },
          })
          stateRef.current = failed
          setState(failed)
          return
        }
        // The Korri launch model: brain prepares the game, then the shell
        // attaches to the stable stream app that now embodies it. Preparing
        // is visible immediately so there is no dead gap before the swap.
        const preparing = LaunchablesState.beginPreparing(
          current,
          entry.game.title,
        )
        // Update the event-handler ref synchronously: React may defer the
        // render, but a repeated confirm in the same frame must see the
        // input-locked Preparing case.
        stateRef.current = preparing
        setState(preparing)
        void korrid
          .sessionPrepare(entry.game.id, entry.game.host)
          .then(async outcome => {
            if (!mountedRef.current || operation !== actionSeq.current) return
            if (outcome._tag !== "Ok") {
              const failed = LaunchablesState.withPrepareOutcome(
                preparing,
                outcome,
              )
              stateRef.current = failed
              setState(failed)
              return
            }
            const result = await bridge.startStream(
              target.value.hostUuid,
              target.value.appId,
            )
            if (!mountedRef.current || operation !== actionSeq.current) return
            const next = LaunchablesState.withStartStreamResult(
              preparing,
              result,
            )
            stateRef.current = next
            setState(next)
          })
      }
    })
    // Stop lives on the existing semantic vocabulary: "options" on the
    // now-playing banner asks korrid to stop the host session, then
    // reloads so the banner reflects the outcome truthfully.
    const offOptions = bus.onAction("options", () => {
      const current = stateRef.current
      const selected = LaunchablesState.selected(current)
      if (selected._tag === "None" || selected.value.kind !== "now-playing")
        return
      const operation = ++actionSeq.current
      const stopRequested = LaunchablesState.beginStopping(current)
      // Lock input before the Promise resolves so repeated Select presses
      // cannot issue duplicate stop requests.
      stateRef.current = stopRequested
      setState(stopRequested)
      void korrid.sessionStop().then(outcome => {
        if (!mountedRef.current || operation !== actionSeq.current) return
        const stopping = LaunchablesState.withStopOutcome(
          stopRequested,
          outcome,
        )
        stateRef.current = stopping
        setState(stopping)
        if (outcome._tag !== "Ok") return

        // A daemon acknowledgement may be Pending (and even Stopped can
        // briefly race status). Keep the banner hidden behind an explicit
        // Stopping case until status confirms the session is gone.
        const pollSeq = ++stopPollSeq.current
        const deadline = Date.now() + STOP_POLL_DEADLINE_MS
        void (async () => {
          while (
            mountedRef.current &&
            operation === actionSeq.current &&
            Date.now() < deadline &&
            pollSeq === stopPollSeq.current
          ) {
            const status = await sessionStatusWithTimeout()
            if (
              !mountedRef.current ||
              operation !== actionSeq.current ||
              pollSeq !== stopPollSeq.current
            ) {
              return
            }
            if (status._tag === "Ok") {
              const afterStatus = LaunchablesState.withStatusAfterStop(
                stopping,
                status,
              )
              if (afterStatus._tag === "Ready") {
                // Commit the observed idle/different launch before the
                // refresh. A second status request may fail; it must not
                // strand the UI in Stopping after truth was established.
                stateRef.current = afterStatus
                setState(afterStatus)
                void load()
                return
              }
            }
            if (
              status._tag === "Err" &&
              status.payload.code !== "StatusTimeout"
            ) {
              const failed = LaunchablesState.withStatusAfterStop(
                stateRef.current,
                status,
              )
              stateRef.current = failed
              setState(failed)
              return
            }
            await new Promise(resolve =>
              setTimeout(resolve, STOP_POLL_INTERVAL_MS),
            )
          }
          if (
            !mountedRef.current ||
            operation !== actionSeq.current ||
            pollSeq !== stopPollSeq.current
          ) {
            return
          }
          const timedOut = LaunchablesState.stopTimedOut(stateRef.current)
          stateRef.current = timedOut
          setState(timedOut)
        })()
      })
    })
    return () => {
      offDirection()
      offActivate()
      offConfirm()
      offOptions()
    }
  }, [bus, bridge, korrid, load, sessionStatusWithTimeout])

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
      {state._tag === "Preparing" && (
        <div className="space-y-2 text-center">
          <p className="text-xl font-semibold">Preparing {state.title}…</p>
          <p className="text-zinc-400">Your stream will start in a moment</p>
        </div>
      )}
      {state._tag === "Launching" && (
        <div className="space-y-2 text-center">
          <p className="text-xl font-semibold">Starting {state.title}…</p>
          <p className="text-zinc-400">Opening your session</p>
        </div>
      )}
      {state._tag === "Stopping" && (
        <div className="space-y-2 text-center">
          <p className="text-xl font-semibold">Stopping session…</p>
          <p className="text-zinc-400">Waiting for the host to finish</p>
        </div>
      )}
      {state._tag === "Ready" && <LaunchablesList state={state} />}
    </main>
  )
}
