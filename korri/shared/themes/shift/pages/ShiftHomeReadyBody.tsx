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
import { ShiftLaunchFailureBanner } from "../molecules/ShiftLaunchFailureBanner"
import { ShiftHomeBottomBar } from "../organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "../organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "../organisms/ShiftHomeTopBar"
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
          />
          <ShiftHomeLaunchSurface launch={launch} />
          <ShiftHomeBottomBar />
        </ShiftHomeRoot>
      ) : null,
  })
}

function ShiftHomeLaunchSurface({
  launch,
}: {
  readonly launch: LaunchController
}) {
  const { items, focused } = useShiftHome()

  const launchFocused = useCallback(() => {
    const focusedGame = items.find(game => game.id === focused.id)
    if (focusedGame) launch.start(focusedGame)
  }, [focused.id, items, launch])

  useInputAction("confirm", launchFocused)

  const failedGame = failedGameFor(items, launch.state)

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
      {launch.state._tag === "Failed" && failedGame ? (
        <ShiftLaunchFailureBanner
          gameTitle={getGameDisplayName(failedGame)}
          exitCode={launch.state.exitCode}
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
  if (state._tag !== "Failed") return undefined
  return items.find(game => game.id === state.gameId) ?? { id: state.gameId }
}
