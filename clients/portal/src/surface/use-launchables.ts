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
import type { SurfaceSettingsStatus } from "@contracts/surface/korri-surface"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  discoverResolvedMoonlight,
  reserveResolvedMoonlightLaunch,
  type LauncherBridge,
} from "../bridge/launcher-bridge"
import type { MoonlightResolveOutcome } from "@contracts/generated/korrid"
import type { KorridClient } from "../korrid/client"
import type { DeviceFacts } from "./settings-model"
import {
  entryKey,
  entryLabel,
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
  readonly settingsStatus: SurfaceSettingsStatus
  changeSetting(settingId: string, value: string): void
  dismissSettingsProblem(): void
  runDeviceAction(actionId: string): void
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
  const [settingsStatus, setSettingsStatus] = useState<SurfaceSettingsStatus>({
    _tag: "Idle",
  })
  const stateRef = useRef(state)
  stateRef.current = state
  const factsRef = useRef(facts)
  factsRef.current = facts
  const streamsRef = useRef<readonly StreamSource[]>([])
  const moonlightRef = useRef<MoonlightResolveOutcome>({
    _tag: "Unavailable",
    payload: {
      code: "MoonlightUnavailable",
      message: "Moonlight has not been resolved",
    },
  })
  const settingsBusyRef = useRef(false)

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

  const load = useCallback(async (preserveAction = false) => {
    const preservingStop = stateRef.current._tag === "Stopping"
    if (!preserveAction && !preservingStop) {
      // A normal full reload supersedes pending UI work. A reload while
      // Stopping is observational only and must not cancel the stop poll.
      actionSeq.current += 1
      stopPollSeq.current += 1
      publish(LaunchablesState.loading())
    }
    const action = actionSeq.current
    // Overlapping loads: only the latest invocation may write state.
    const seq = ++loadSeq.current
    const [
      games,
      localGames,
      moonlightDiscovery,
      session,
      storage,
      notice,
      health,
      settings,
      systemInfo,
    ] = await Promise.all([
        korrid.catalogSnapshot(),
        korrid.localGames(),
        korrid
          .moonlightResolve()
          .then(resolution => discoverResolvedMoonlight(resolution, bridge)),
        sessionStatusWithTimeout(),
        // Re-read on every load so returning from system settings clears the
        // prompt without the user restarting Korri.
        bridge.storageAccess(),
        // Same reason: returning from the notification screen should be
        // reflected without a restart.
        bridge.backgroundNotice(),
        // Identity, not content: it names the software the user is running.
        korrid.health(),
        korrid.settingsSnapshot(),
        bridge.systemInfo(),
      ])
    const streams: readonly StreamSource[] = moonlightDiscovery.streams
    const hostsResult = moonlightDiscovery.hostsResult ?? {
      _tag: "QueryFailed" as const,
      message:
        moonlightDiscovery.resolution._tag === "Unavailable"
          ? moonlightDiscovery.resolution.payload.message
          : "Moonlight discovery unavailable",
    }
    if (
      !mountedRef.current ||
      seq !== loadSeq.current ||
      (preserveAction && action !== actionSeq.current)
    ) return
    streamsRef.current = streams
    moonlightRef.current = moonlightDiscovery.resolution
    setFacts({
      ...(health._tag === "Ok" ? { version: health.payload.version } : {}),
      ...(settings._tag === "Ok" ? { settings: settings.payload } : {}),
      systemInfo,
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
    // Recovery reads must not replace a newer launch operation's visible lock.
    if (
      preserveAction &&
      current._tag !== "Loading" &&
      current._tag !== "Ready"
    ) return
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

  /** Locate the plugin-owned app, constrained to the prepared game's host. */
  const findKorriStreamTarget = useCallback((hostName?: string) => {
    const resolution = moonlightRef.current
    return resolution._tag === "Available"
      ? LaunchablesState.korriStreamTarget(
          resolution.payload,
          streamsRef.current,
          hostName,
        )
      : { _tag: "None" as const }
  }, [])

  const moonlightTargetFailure = useCallback((hostName?: string) => {
    const resolution = moonlightRef.current
    if (resolution._tag === "Unavailable") return resolution.payload.message
    return hostName === undefined
      ? `no "${resolution.payload.sunshineApp}" app on a paired host`
      : `no "${resolution.payload.sunshineApp}" app on paired host ${hostName}`
  }, [])

  const noticeOnReady = useCallback(
    (operation: number, message: string) => {
      if (!mountedRef.current || operation !== actionSeq.current) return
      const now = stateRef.current
      if (now._tag !== "Ready") return
      publish(LaunchablesState.withNotice(now, message))
    },
    [publish],
  )

  const settingsProblem = useCallback((settingId: string, message: string) => {
    setSettingsStatus({ _tag: "Problem", settingId, message })
  }, [])

  const runDeviceAction = useCallback(
    (actionId: string) => {
      if (actionId === "pairing") {
        void bridge.openPairing().then(result => {
          if (result._tag === "Unavailable") {
            settingsProblem(actionId, result.message)
          }
        })
        return
      }
      if (actionId === "storage-access") {
        void bridge.openStorageAccessSettings().then(result => {
          if (result._tag === "Unavailable") {
            settingsProblem(actionId, result.message)
          }
        })
        return
      }
      if (actionId === "background-notice") {
        void (async () => {
          if (factsRef.current.notice?._tag === "Visible") {
            return bridge.openNotificationSettings()
          }
          const result = await bridge.requestBackgroundNotice()
          return result._tag === "Unprompted"
            ? bridge.openNotificationSettings()
            : { _tag: "Opened" as const }
        })().then(result => {
          if (result._tag === "Unavailable") {
            settingsProblem(actionId, result.message)
          }
        })
        return
      }
      settingsProblem(actionId, "This setting is not available")
    },
    [bridge, settingsProblem],
  )

  const changeSetting = useCallback(
    (settingId: string, value: string) => {
      // React may defer the Saving render; close the same-frame double-confirm
      // gap synchronously so two writes cannot turn one success into a conflict.
      if (settingsBusyRef.current) return
      settingsBusyRef.current = true
      const revision = factsRef.current.settings?.revision
      if (!revision) {
        settingsBusyRef.current = false
        settingsProblem(settingId, "Settings are not available")
        return
      }
      setSettingsStatus({ _tag: "Saving", settingId })
      void korrid.updateSetting(revision, settingId, value).then(result => {
        settingsBusyRef.current = false
        if (!mountedRef.current) return
        if (result._tag === "Err") {
          settingsProblem(settingId, result.payload.message)
          if (result.payload.code === "SettingsConflict") void load()
          return
        }
        const next = { ...factsRef.current, settings: result.payload }
        factsRef.current = next
        setFacts(next)
        setSettingsStatus({ _tag: "Idle" })
        // Plugin changes alter fulfillability; a successful save therefore
        // refreshes the library rather than waiting for another screen visit.
        void load()
      })
    },
    [korrid, load, settingsProblem],
  )

  const dismissSettingsProblem = useCallback(
    () => setSettingsStatus({ _tag: "Idle" }),
    [],
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
              reason:
                moonlightRef.current._tag === "Unavailable"
                  ? "StartFailed"
                  : "AppNotFound",
              message: moonlightTargetFailure(entry.session.host),
            }),
          )
          return
        }
        void (async () => {
          const reservation = await reserveResolvedMoonlightLaunch(
            moonlightRef.current,
            korrid,
            target.value.hostUuid,
            target.value.appId,
          )
          if (reservation._tag !== "Ok") {
            if (!mountedRef.current || operation !== actionSeq.current) return
            publish(
              LaunchablesState.withStartStreamResult(launching, {
                _tag: "StreamFailed",
                reason: "StartFailed",
                message: reservation.payload.message,
              }),
            )
            return
          }
          if (!mountedRef.current || operation !== actionSeq.current) {
            await korrid.moonlightLaunchCancel(reservation.payload.launchId)
            return
          }
          // This checkpoint is deliberately adjacent to the native call. No
          // helper may hide an await between cancellation authority and start.
          const result = await bridge.startStream(reservation.payload)
          if (!mountedRef.current || operation !== actionSeq.current) {
            if (mountedRef.current) void load(true)
            return
          }
          publish(LaunchablesState.withStartStreamResult(launching, result))
          if (result._tag === "StreamFailed") void load(true)
        })()
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
              message: moonlightTargetFailure(entry.game.host),
            },
          }),
        )
        return
      }
      // Reserve the signed one-use native launch before asking the host to
      // prepare. A signing failure must not leave an unmanaged remote game.
      // Preparing is visible immediately so there is no dead gap before swap.
      publish(preparing)
      void (async () => {
        const reservation = await reserveResolvedMoonlightLaunch(
          moonlightRef.current,
          korrid,
          target.value.hostUuid,
          target.value.appId,
        )
        if (reservation._tag !== "Ok") {
          if (!mountedRef.current || operation !== actionSeq.current) return
          publish(
            LaunchablesState.withStartStreamResult(preparing, {
              _tag: "StreamFailed",
              reason: "StartFailed",
              message: reservation.payload.message,
            }),
          )
          return
        }
        if (!mountedRef.current || operation !== actionSeq.current) {
          await korrid.moonlightLaunchCancel(reservation.payload.launchId)
          return
        }

        const prepared = await korrid.sessionPrepare(
          entry.game.id,
          entry.game.host,
        )
        if (prepared._tag !== "Ok") {
          await korrid.moonlightLaunchCancel(reservation.payload.launchId)
          if (!mountedRef.current || operation !== actionSeq.current) return
          publish(LaunchablesState.withPrepareOutcome(preparing, prepared))
          return
        }
        if (!mountedRef.current || operation !== actionSeq.current) {
          await korrid.moonlightLaunchCancel(reservation.payload.launchId)
          if (mountedRef.current) void load(true)
          return
        }

        // Host preparation has completed, so cancellation authority is checked
        // immediately before Artemis starts, with no hidden await in between.
        const result = await bridge.startStream(reservation.payload)
        if (!mountedRef.current || operation !== actionSeq.current) {
          if (mountedRef.current) void load(true)
          return
        }
        publish(LaunchablesState.withStartStreamResult(preparing, result))
        // Native failure does not mean the host stopped. Re-read status so the
        // prepared session is visible and resumable instead of being stranded.
        if (result._tag === "StreamFailed") void load(true)
      })()
    },
    [
      bridge,
      findKorriStreamTarget,
      korrid,
      load,
      moonlightTargetFailure,
      noticeOnReady,
      publish,
    ],
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

  return {
    state,
    facts,
    settingsStatus,
    changeSetting,
    dismissSettingsProblem,
    runDeviceAction,
    confirmEntry,
    stopSession,
    dismissNotice,
    reload,
  }
}
