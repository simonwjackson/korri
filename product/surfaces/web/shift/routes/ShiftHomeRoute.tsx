import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import { launchActionStateFrom } from "@platform/library/launch-action-state"
import {
  LaunchState,
  type LaunchState as LaunchStateValue,
} from "@platform/library/launch-state"
import { launchFailureExitCode } from "@platform/library/launcher"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
  getPlayableWideImageUrl,
} from "@platform/library/playable-library-ui"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useOptionalDualScreenSession } from "@platform/react/display/dual-screen/DualScreenSession.context"
import { foregroundSessionGateStateAtom } from "@platform/react/library/library-atoms"
import { useLibraryLaunchController } from "@platform/react/library/use-library-launch-controller"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import { Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type ComponentProps, useCallback, useEffect, useState } from "react"

const noop = () => {}

import {
  ShiftCatalogStateRoot,
  useShiftCatalogCase,
} from "../catalog/ShiftCatalogStateRoot"
import { ShiftCatalogState } from "../catalog/shift-catalog-state"
import {
  type ShiftCinematicGame,
  ShiftCinematicHome,
} from "../pages/ShiftCinematicHome"
import { ShiftHomeDefectBody } from "../pages/ShiftHomeDefectBody"
import { ShiftHomeEmptyBody } from "../pages/ShiftHomeEmptyBody"
import { ShiftHomeLoadErrorBody } from "../pages/ShiftHomeLoadErrorBody"
import { ShiftHomeLoadingBody } from "../pages/ShiftHomeLoadingBody"
import { useShiftCatalogPreview } from "../shift-catalog-preview"
import {
  setShiftForegroundPreview,
  useShiftForegroundPreview,
} from "../shift-foreground-preview"
import {
  setShiftLaunchPreview,
  useShiftLaunchPreview,
} from "../shift-launch-preview"
import {
  setShiftLiveData,
  setShiftLiveForeground,
  setShiftLiveLaunch,
} from "../shift-live-coordinate"
import { playtimeLabel, relativeLastPlayed } from "./cinematic-play-labels"

const AVATAR = "https://i.pravatar.cc/96?u=korri-shift-user"
const UNKNOWN_FOREGROUND = {
  _tag: "Unknown",
  state: "foreground-status-waiting",
} satisfies ForegroundSessionGateState
const LOAD_ERROR_FOREGROUND = {
  _tag: "LoadError",
  message: "Unable to read foreground session status.",
} satisfies ForegroundSessionGateState

function foregroundStateFromAtom(
  result: AsyncResult.AsyncResult<ForegroundSessionGateState, unknown>,
): ForegroundSessionGateState {
  return AsyncResult.matchWithWaiting(result, {
    onWaiting: () => UNKNOWN_FOREGROUND,
    onError: () => LOAD_ERROR_FOREGROUND,
    onDefect: () => LOAD_ERROR_FOREGROUND,
    onSuccess: success => success.value,
  })
}

export function shiftLaunchStateForForeground({
  launch,
  foreground,
}: {
  readonly launch: LaunchStateValue
  readonly foreground: ForegroundSessionGateState | undefined
}): LaunchStateValue {
  if (!foreground) return launch
  const canApplyForegroundGate =
    launch._tag !== "Launching" && launch._tag !== "Launched"
  if (!canApplyForegroundGate) return launch
  const action = launchActionStateFrom({ launch: LaunchState.idle, foreground })
  if (!action) return launch
  switch (action._tag) {
    case "Allowed":
    case "Launching":
      return launch
    case "AllowedWithUnknownStatus":
      return launch
    case "Blocked":
      return {
        _tag: "Failed",
        gameId: action.gameId ?? "foreground-session",
        exitCode: launchFailureExitCode("session-busy"),
        failureKind: "session-busy",
      }
  }
}

export function visibleShiftLaunchState({
  launch,
  foreground,
  acked,
}: {
  readonly launch: LaunchStateValue
  readonly foreground: ForegroundSessionGateState | undefined
  readonly acked: boolean
}): LaunchStateValue {
  const raw = shiftLaunchStateForForeground({ launch, foreground })
  const foregroundBlocked =
    launch._tag !== "Launching" &&
    shiftLaunchStateForForeground({
      launch: LaunchState.idle,
      foreground,
    })._tag !== "Idle"
  return acked && !foregroundBlocked ? LaunchState.idle : raw
}

/**
 * The home's full data-state composition, seedable by `result` so any host (the
 * live route, or a gallery part) can drive it through Loading / LoadError /
 * Defect / Empty / Ready without a backend.
 */
export function ShiftHomeStateView({
  result,
  onRetry,
}: {
  readonly result: ComponentProps<typeof ShiftCatalogStateRoot>["result"]
  readonly onRetry?: () => void
}) {
  return (
    <div data-shift-home-frame>
      <ShiftCatalogStateRoot result={result}>
        <ShiftHomeLoadingBody />
        <ShiftHomeLoadErrorBody onRetry={onRetry ?? noop} />
        <ShiftHomeDefectBody />
        <ShiftHomeEmptyBody />
        <NavigatingReadyBody />
      </ShiftCatalogStateRoot>
    </div>
  )
}

export function ShiftHomeRoute() {
  const live = useAtomValue(catalogSnapshotAtom)
  const refreshSnapshot = useAtomRefresh(catalogSnapshotAtom)
  // The design-tool data pin wins over the live loader when set; releasing it
  // (preview = null) falls straight back to the real catalog snapshot.
  const snapshot = useShiftCatalogPreview() ?? live
  // Publish the resolved data state for the design-tool capture seam (inert in
  // production — nothing reads it there).
  const dataTag = ShiftCatalogState.fromResult(snapshot)._tag
  useEffect(() => {
    setShiftLiveData(dataTag)
  }, [dataTag])
  return <ShiftHomeStateView result={snapshot} onRetry={refreshSnapshot} />
}

function NavigatingReadyBody() {
  const ready = useShiftCatalogCase("Ready")
  const launch = useLibraryLaunchController()
  const liveForeground = foregroundStateFromAtom(
    useAtomValue(foregroundSessionGateStateAtom),
  )
  const foregroundPreview = useShiftForegroundPreview()
  const foreground = foregroundPreview ?? liveForeground
  const preview = useShiftLaunchPreview()
  const focusGame = useOptionalDualScreenSession()?.focusGame
  const publishGameFocus = useCallback(
    (gameId: string) => focusGame?.(gameId, "primary"),
    [focusGame],
  )
  const [acked, setAcked] = useState(false)

  // The design-tool preview override wins over the live controller when set.
  const rawLaunch = preview ?? launch.state
  const raw = shiftLaunchStateForForeground({
    launch: rawLaunch,
    foreground,
  })
  // A fresh launch (idle/launching) re-arms the dismissable feedback.
  useEffect(() => {
    if (raw._tag === "Idle" || raw._tag === "Launching") setAcked(false)
  }, [raw._tag])
  const launchState = visibleShiftLaunchState({
    launch: rawLaunch,
    foreground,
    acked,
  })

  // Publish the on-screen launch and foreground state for the design-tool
  // capture seam.
  useEffect(() => {
    setShiftLiveLaunch(launchState._tag)
  }, [launchState._tag])

  useEffect(() => {
    setShiftLiveForeground(foreground._tag)
  }, [foreground._tag])

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) =>
      games.length > 0 ? (
        <ShiftCinematicHome
          games={games.map(toCinematicGame)}
          avatarSrc={AVATAR}
          launchState={launchState}
          onGameFocus={publishGameFocus}
          onLaunch={makeLaunchHandler(games, launch.start)}
          onRetry={() => {
            if (preview) setShiftLaunchPreview(null)
            else if (foregroundPreview) setShiftForegroundPreview(null)
            else launch.retry()
          }}
          onDismiss={() => {
            if (preview) setShiftLaunchPreview(null)
            else if (foregroundPreview) setShiftForegroundPreview(null)
            else setAcked(true)
          }}
        />
      ) : null,
  })
}

/**
 * Wire the cinematic home's "A = Play" confirm to the real launch controller:
 * resolve the focused tile's id back to its catalog entry and start it (same
 * entry-driven launch the detail screen uses). Unknown ids are ignored.
 */
export function makeLaunchHandler(
  games: readonly CatalogEntry[],
  start: (entry: CatalogEntry) => void,
): (id: string) => void {
  return id => {
    const entry = games.find(game => game.id === id)
    if (entry) start(entry)
  }
}

export function toCinematicGame(game: CatalogEntry): ShiftCinematicGame {
  const tile = getPlayableImageUrl(game)
  const lastPlayed = dateValue(game.userData?.lastPlayed)
  const playtime = numberValue(game.userData?.playtime)
  const favorite = game.userData?.favorite === true

  return {
    id: game.id,
    title: getPlayableDisplayName(game),
    tileArtUrl: tile ?? "",
    wideArtUrl: getPlayableWideImageUrl(game) ?? tile ?? "",
    ...(game.metadata?.genre?.[0] ? { genre: game.metadata.genre[0] } : {}),
    ...(game.metadata?.developer ? { developer: game.metadata.developer } : {}),
    ...(lastPlayed ? { lastPlayedLabel: relativeLastPlayed(lastPlayed) } : {}),
    ...(playtime ? { playtimeLabel: playtimeLabel(playtime) } : {}),
    ...(favorite ? { favorite: true } : {}),
  }
}

function dateValue(value: unknown): Date | undefined {
  if (value instanceof Date) return value
  if (typeof value !== "string") return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined
}
