import { useAtomValue } from "@effect/atom-react"
import {
  type LaunchActionState,
  launchActionStateAllowsStart,
  launchActionStateFrom,
} from "@platform/library/launch-action-state"
import type { LaunchController } from "@platform/library/launch-state"
import { asPlayableLibraryEntry } from "@platform/library/playable-library"
import { getPlayableDisplayName } from "@platform/library/playable-library-ui"
import { useInputAction } from "@platform/react/input/use-input-action"
import { foregroundSessionGateStateAtom } from "@platform/react/library/library-atoms"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import { Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useShiftCatalogCase } from "../catalog/ShiftCatalogStateRoot"
import { ShiftForegroundSessionGateNotice } from "../molecules/ShiftForegroundSessionGateNotice"
import { ShiftHomeCaption } from "../molecules/ShiftHomeCaption"
import { ShiftLabsButton } from "../molecules/ShiftLabsButton"
import { ShiftLaunchFailureBanner } from "../molecules/ShiftLaunchFailureBanner"
import { ShiftUiScaleControl } from "../molecules/ShiftUiScaleControl"
import { ShiftHomeBottomBar } from "../organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "../organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "../organisms/ShiftHomeTopBar"
import { ShiftLabsPanel } from "../organisms/ShiftLabsPanel"
import { ShiftSystemPanel } from "../organisms/ShiftSystemPanel"
import {
  type ShiftHomeItem,
  useShiftHome,
} from "../templates/ShiftHome.context"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"

const PLACEHOLDER_TIME = "4:24 PM"
const PLACEHOLDER_AVATAR_SRC = "https://i.pravatar.cc/96?u=korri-shift-user"

export function ShiftHomeReadyBody({
  launch,
}: {
  readonly launch: LaunchController
}) {
  const ready = useShiftCatalogCase("Ready")

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) =>
      games.length > 0 ? (
        <ShiftHomeRoot items={games}>
          <ShiftHomeTopBar
            time={PLACEHOLDER_TIME}
            avatarSrc={PLACEHOLDER_AVATAR_SRC}
            trailingActions={<ShiftHomeLabsButton />}
          />
          <ShiftHomeLabsPanel />
          <ShiftHomeSystemPanel />
          <ShiftSystemActionBridge />
          <ShiftHomeLaunchSurface launch={launch} />
          <ShiftHomeBottomBar />
        </ShiftHomeRoot>
      ) : null,
  })
}

function ShiftHomeLabsButton() {
  const { openLabs } = useShiftHome()
  return <ShiftLabsButton onActivate={openLabs} />
}

function ShiftSystemActionBridge() {
  const { openSystemPanel } = useShiftHome()
  useInputAction("system", openSystemPanel)
  return null
}

function ShiftHomeLabsPanel() {
  const { uiScale, changeUiScale, resetUiScale } = useShiftHome()

  return (
    <ShiftLabsPanel>
      <ShiftUiScaleControl
        value={uiScale}
        onChange={changeUiScale}
        onReset={resetUiScale}
      />
    </ShiftLabsPanel>
  )
}

function ShiftHomeSystemPanel() {
  return <ShiftSystemPanel />
}

function ShiftHomeLaunchSurface({
  launch,
}: {
  readonly launch: LaunchController
}) {
  const { items } = useShiftHome()
  const foregroundGateResult = useAtomValue(foregroundSessionGateStateAtom)
  const foregroundGate = foregroundGateStateFromResult(foregroundGateResult)
  const actionState = launchActionStateFrom({
    launch: launch.state,
    foreground: foregroundGate,
  })

  const failedGame = failedGameFor(items, launch.state)
  const actionGame = actionGameFor(items, actionState)

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
      {shouldShowLaunchFailure(launch.state) && failedGame ? (
        <ShiftLaunchFailureBanner
          gameTitle={getPlayableDisplayName(failedGame)}
          exitCode={
            launch.state._tag === "Failed" ? launch.state.exitCode : undefined
          }
          failureKind={
            launch.state._tag === "Failed"
              ? launch.state.failureKind
              : undefined
          }
          onRetry={launch.retry}
        />
      ) : null}
      {shouldShowForegroundGateNotice(actionState) ? (
        <ShiftForegroundSessionGateNotice
          state={actionState}
          gameTitle={
            actionGame ? getPlayableDisplayName(actionGame) : undefined
          }
          providerLifecycle={foregroundGate.providerLifecycle}
        />
      ) : null}
      <ShiftHomeRail
        onItemClick={game => {
          if (launchActionStateAllowsStart(actionState)) {
            launch.start({
              ...asPlayableLibraryEntry(game),
              source: game.source,
            })
          }
        }}
      />
      <ShiftHomeCaption />
    </div>
  )
}

function foregroundGateStateFromResult(
  result: AsyncResult.AsyncResult<ForegroundSessionGateState, never>,
): ForegroundSessionGateState {
  return AsyncResult.matchWithWaiting(result, {
    onWaiting: () => ({ _tag: "Unknown" }),
    onError: error => ({ _tag: "LoadError", message: String(error) }),
    onDefect: defect => ({ _tag: "LoadError", message: String(defect) }),
    onSuccess: success => success.value,
  })
}

function actionGameFor(
  items: readonly ShiftHomeItem[],
  state: LaunchActionState,
): ShiftHomeItem | undefined {
  const gameId = "gameId" in state ? state.gameId : undefined
  if (!gameId) return undefined
  return items.find(game => game.id === gameId)
}

function shouldShowForegroundGateNotice(
  state: LaunchActionState,
): state is Extract<
  LaunchActionState,
  { readonly _tag: "Blocked" | "AllowedWithUnknownStatus" | "Launching" }
> {
  return (
    state._tag === "Blocked" ||
    state._tag === "AllowedWithUnknownStatus" ||
    state._tag === "Launching"
  )
}

function failedGameFor(
  items: readonly ShiftHomeItem[],
  state: LaunchController["state"],
): ShiftHomeItem | undefined {
  if (!shouldShowLaunchFailure(state)) return undefined
  return items.find(game => game.id === state.gameId)
}

function shouldShowLaunchFailure(
  state: LaunchController["state"],
): state is Extract<
  LaunchController["state"],
  { readonly _tag: "Failed" | "Defect" }
> {
  return state._tag === "Failed" || state._tag === "Defect"
}
