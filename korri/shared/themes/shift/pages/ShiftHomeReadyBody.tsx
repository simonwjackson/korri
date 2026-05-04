import {
  type GameRecord,
  getGameDisplayName,
} from "@shared/fixtures/games/game"
import type { LaunchController } from "@shared/library/launch-state"
import { useLibraryListCase } from "@shared/library/library-list-state-root"
import { useInputAction } from "@shared/navigation/use-input-action"
import { Option } from "effect"
import { useCallback } from "react"
import { ShiftHomeCaption } from "../molecules/ShiftHomeCaption"
import { ShiftLabsButton } from "../molecules/ShiftLabsButton"
import { ShiftLaunchFailureBanner } from "../molecules/ShiftLaunchFailureBanner"
import { ShiftUiScaleControl } from "../molecules/ShiftUiScaleControl"
import { ShiftHomeBottomBar } from "../organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "../organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "../organisms/ShiftHomeTopBar"
import { ShiftLabsPanel } from "../organisms/ShiftLabsPanel"
import { useShiftHome } from "../templates/ShiftHome.context"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"

const PLACEHOLDER_TIME = "4:24 PM"
const PLACEHOLDER_AVATAR_SRC = "https://i.pravatar.cc/96?u=korri-shift-user"

export function ShiftHomeReadyBody({
  launch,
}: {
  readonly launch: LaunchController
}) {
  const ready = useLibraryListCase("Ready")

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

function ShiftHomeLaunchSurface({
  launch,
}: {
  readonly launch: LaunchController
}) {
  const { items, focused, isLabsOpen } = useShiftHome()

  const launchFocused = useCallback(() => {
    if (isLabsOpen) return
    const focusedGame = items.find(game => game.id === focused.id)
    if (focusedGame) launch.start(focusedGame)
  }, [focused.id, isLabsOpen, items, launch])

  useInputAction("confirm", launchFocused)

  const failedGame = failedGameFor(items, launch.state)

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
      {shouldShowLaunchFailure(launch.state) && failedGame ? (
        <ShiftLaunchFailureBanner
          gameTitle={getGameDisplayName(failedGame)}
          exitCode={
            launch.state._tag === "Failed" ? launch.state.exitCode : undefined
          }
          onRetry={launch.retry}
        />
      ) : null}
      <ShiftHomeRail onItemClick={game => launch.start(game)} />
      <ShiftHomeCaption />
    </div>
  )
}

function failedGameFor(
  items: readonly GameRecord[],
  state: LaunchController["state"],
): GameRecord | undefined {
  if (!shouldShowLaunchFailure(state)) return undefined
  return items.find(game => game.id === state.gameId) ?? { id: state.gameId }
}

function shouldShowLaunchFailure(
  state: LaunchController["state"],
): state is Extract<
  LaunchController["state"],
  { readonly _tag: "Failed" | "Defect" }
> {
  return state._tag === "Failed" || state._tag === "Defect"
}
