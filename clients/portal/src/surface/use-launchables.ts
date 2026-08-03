/**
 * The portal's launchables brain, independent of any surface.
 *
 * It owns every effect the screen can cause — loading sources, launching a
 * local game, preparing and attaching a stream, resuming, stopping, opening
 * system screens — and publishes the result as the tested `LaunchablesState`
 * ADT. What it deliberately does NOT own is selection or input: a surface
 * decides what is focused and calls `confirmEntry` with the entry it means.
 * That is what lets Korri swap surfaces without moving this logic.
 */
import { SHELL_RESUMED_EVENT } from "@contracts/bridge/korri-native-bridge"
import { useCallback, useEffect, useRef, useState } from "react"
import type { LauncherBridge } from "../bridge/launcher-bridge"
import type { KorridClient } from "../korrid/client"
import type { DeviceFacts } from "./settings-model"
import {
  entryKey,
  entryLabel,
  KORRI_STREAM_APP,
  LaunchablesState,
  type PortalEntry,
  type StreamSource,
} from "../launchables/state"

/**
 * The now-playing banner is garnish, not core content: a slow or hung
 * status query must not hold the whole list hostage. Past this deadline
 * the status degrades to the same silent no-banner path as a failure.
 */
const SESSION_STATUS_TIMEOUT_MS = 3000
const STOP_POLL_INTERVAL_MS = 500
const STOP_POLL_DEADLINE_MS = 8000

export interface Launchables {
  readonly state: LaunchablesState
  /** What Korri knows about the device itself, as opposed to what it can play. */
  readonly facts: DeviceFacts
  /** Act on one entry: launch, resume, pair, or open a system screen. */
  confirmEntry(entry: PortalEntry): void
  /** Ask the host to stop the running session and wait for it to be gone. */
  stopSession(entry: PortalEntry): void
  /** Clear the current notice without re-reading anything. */
  dismissNotice(): void
  /** Re-read every source. */
  reload(): void
}

export function useLaunchables(
  bridge: LauncherBridge,
  korrid: KorridClient,
): Launchables {
  const [state, setState] = useState<LaunchablesState>(LaunchablesState.loading)
  // Device facts ride along with each load but are deliberately not part of
  // the launchables ADT: settings is not a thing you can play, and folding it
  // into that state would make every list transition carry it.
  const [facts, setFacts] = useState<DeviceFacts>({})
  const stateRef = useRef(state)
  stateRef.current = state
  const streamsRef = useRef<readonly StreamSource[]>([])

  const loadSeq = useRef(0)
  const actionSeq = useRef(0)
  const stopPollSeq = useRef(0)
  const mountedRef = useRef(true)

  const publish = useCallback((next: LaunchablesState) => {
    // Update the ref synchronously: React may defer the render, but a repeated
    // confirm in the same frame must observe the input-locked case.
    stateRef.current = next
    setState(next)
  }, [])

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
      publish(LaunchablesState.loading())
    }
    // Overlapping loads: only the latest invocation may write state.
    const seq = ++loadSeq.current
    const [games, localGames, hostsResult, session, storage, notice, health] =
      await Promise.all([
        korrid.catalogSnapshot(),
        korrid.localGames(),
        bridge.queryStreamHosts(),
        sessionStatusWithTimeout(),
        // Re-read on every load so returning from system settings clears the
        // prompt without the user restarting Korri.
        bridge.storageAccess(),
        // Same reason: returning from the notification screen should be
        // reflected without a restart.
        bridge.backgroundNotice(),
        // Identity, not content: it names the software the user is running.
        korrid.health(),
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
    setFacts({
      ...(health._tag === "Ok" ? { version: health.payload.version } : {}),
      storage,
      notice,
      ...(hostsResult._tag === "StreamHosts"
        ? { hosts: hostsResult.items }
        : {}),
      ...(localGames._tag === "Ok"
        ? { localGameCount: localGames.payload.games.length }
        : {}),
    })
    const current = stateRef.current
    const loaded = LaunchablesState.fromSources(
      streams,
      games,
      hostsResult._tag === "QueryFailed" ? hostsResult.message : undefined,
      session,
      localGames,
      storage,
      notice,
    )
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
    publish(loaded)
  }, [bridge, korrid, publish, sessionStatusWithTimeout])

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
  const findKorriStreamTarget = useCallback(
    (hostName?: string) =>
      LaunchablesState.korriStreamTarget(streamsRef.current, hostName),
    [],
  )

  const noticeOnReady = useCallback(
    (operation: number, message: string) => {
      if (!mountedRef.current || operation !== actionSeq.current) return
      const now = stateRef.current
      if (now._tag !== "Ready") return
      publish(LaunchablesState.withNotice(now, message))
    },
    [publish],
  )

  const confirmEntry = useCallback(
    (entry: PortalEntry) => {
      const current = stateRef.current
      // Only Ready accepts new work; Preparing/Launching/Stopping are locked by
      // the model rather than by a nullable flag convention.
      if (current._tag !== "Ready") return
      const operation = ++actionSeq.current

      if (entry.kind === "pairing") {
        // Native owns pairing: it exchanges a PIN and stores certificates.
        void bridge.openPairing().then(result => {
          if (result._tag === "Unavailable") {
            noticeOnReady(operation, `cannot open pairing: ${result.message}`)
          }
        })
        return
      }

      if (entry.kind === "background-notice") {
        // Turning it on is a prompt Korri may show; turning it off is not
        // Korri's to do — Android reserves hiding a background notice for
        // the user — so that direction can only open settings. Either way
        // the result is discovered on resume, not from the call.
        void (
          (async () => {
            if (entry.visible) return bridge.openNotificationSettings()
            const outcome = await bridge.requestBackgroundNotice()
            return outcome._tag === "Unprompted"
              ? bridge.openNotificationSettings()
              : { _tag: "Opened" as const }
          })()
        ).then(result => {
          if (result._tag === "Unavailable") {
            noticeOnReady(
              operation,
              `cannot open notification settings: ${result.message}`,
            )
          }
        })
        return
      }

      if (entry.kind === "storage-access") {
        // The shell can only take the user to the system screen; it cannot
        // grant anything. Whether they said yes is discovered on resume,
        // when the sources are re-read.
        void bridge.openStorageAccessSettings().then(result => {
          if (result._tag === "Unavailable") {
            noticeOnReady(operation, `cannot open settings: ${result.message}`)
          }
        })
        return
      }

      if (entry.kind === "now-playing") {
        // Resume: the host session is already prepared — attach straight
        // to the stable stream app without re-preparing.
        const launching = LaunchablesState.beginLaunching(
          current,
          entryLabel(entry),
        )
        publish(launching)
        const target = findKorriStreamTarget(entry.session.host)
        if (target._tag === "None") {
          publish(
            LaunchablesState.withStartStreamResult(launching, {
              _tag: "StreamFailed",
              reason: "AppNotFound",
              message: `no "${KORRI_STREAM_APP}" app on a paired host`,
            }),
          )
          return
        }
        void bridge
          .startStream(target.value.hostUuid, target.value.appId)
          .then(result => {
            if (!mountedRef.current || operation !== actionSeq.current) return
            publish(
              LaunchablesState.withStartStreamResult(launching, result),
            )
          })
        return
      }

      if (entry.kind === "local-game") {
        const launching = LaunchablesState.beginLaunching(
          current,
          entryLabel(entry),
        )
        publish(launching)
        void korrid.localGameLaunch(entry.game.id).then(async outcome => {
          if (!mountedRef.current || operation !== actionSeq.current) return
          if (outcome._tag !== "Ok") {
            publish(
              LaunchablesState.withLocalLaunchOutcome(launching, outcome),
            )
            return
          }
          const result = await bridge.launchLocal(outcome.payload)
          if (!mountedRef.current || operation !== actionSeq.current) return
          publish(LaunchablesState.withLocalLaunchResult(launching, result))
        })
        return
      }

      if (entry.kind === "stream") {
        const launching = LaunchablesState.beginLaunching(
          current,
          entryLabel(entry),
        )
        publish(launching)
        void bridge.startStream(entry.hostUuid, entry.app.id).then(result => {
          if (!mountedRef.current || operation !== actionSeq.current) return
          publish(LaunchablesState.withStartStreamResult(launching, result))
        })
        return
      }

      // Never arm a host unless the shell can attach to that exact host.
      // Otherwise prepare would leave an unmanaged game running unseen.
      const target = findKorriStreamTarget(entry.game.host)
      const preparing = LaunchablesState.beginPreparing(
        current,
        entry.game.title,
      )
      if (target._tag === "None") {
        publish(
          LaunchablesState.withPrepareOutcome(preparing, {
            _tag: "Err",
            payload: {
              code: "NoStreamTarget",
              message:
                entry.game.host === undefined
                  ? `no "${KORRI_STREAM_APP}" app on a paired host`
                  : `no "${KORRI_STREAM_APP}" app on paired host ${entry.game.host}`,
            },
          }),
        )
        return
      }
      // The Korri launch model: brain prepares the game, then the shell
      // attaches to the stable stream app that now embodies it. Preparing
      // is visible immediately so there is no dead gap before the swap.
      publish(preparing)
      void korrid
        .sessionPrepare(entry.game.id, entry.game.host)
        .then(async outcome => {
          if (!mountedRef.current || operation !== actionSeq.current) return
          if (outcome._tag !== "Ok") {
            publish(LaunchablesState.withPrepareOutcome(preparing, outcome))
            return
          }
          const result = await bridge.startStream(
            target.value.hostUuid,
            target.value.appId,
          )
          if (!mountedRef.current || operation !== actionSeq.current) return
          publish(LaunchablesState.withStartStreamResult(preparing, result))
        })
    },
    [bridge, findKorriStreamTarget, korrid, noticeOnReady, publish],
  )

  const stopSession = useCallback(
    (entry: PortalEntry) => {
      const current = stateRef.current
      if (current._tag !== "Ready" || entry.kind !== "now-playing") return
      const operation = ++actionSeq.current
      // Lock input before the Promise resolves so repeated stop requests
      // cannot be issued twice.
      const stopRequested = LaunchablesState.beginStopping(current, entry)
      publish(stopRequested)
      void korrid.sessionStop().then(outcome => {
        if (!mountedRef.current || operation !== actionSeq.current) return
        const stopping = LaunchablesState.withStopOutcome(
          stopRequested,
          outcome,
        )
        publish(stopping)
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
                publish(afterStatus)
                void load()
                return
              }
            }
            if (
              status._tag === "Err" &&
              status.payload.code !== "StatusTimeout"
            ) {
              publish(
                LaunchablesState.withStatusAfterStop(stateRef.current, status),
              )
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
          publish(LaunchablesState.stopTimedOut(stateRef.current))
        })()
      })
    },
    [korrid, load, publish, sessionStatusWithTimeout],
  )

  const dismissNotice = useCallback(() => {
    const current = stateRef.current
    if (current._tag !== "Ready" || current.notice === null) return
    publish({ ...current, notice: null })
  }, [publish])

  const reload = useCallback(() => void load(), [load])

  return { state, facts, confirmEntry, stopSession, dismissNotice, reload }
}
