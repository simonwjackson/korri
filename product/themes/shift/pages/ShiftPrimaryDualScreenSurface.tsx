import type { LaunchController } from "@platform/library/launch-state"
import { asPlayableLibraryEntry } from "@platform/library/playable-library"
import { getPlayableDisplayName } from "@platform/library/playable-library-ui"
import { useDualScreenSession } from "@platform/react/display/dual-screen/DualScreenSession.context"
import { useEffect } from "react"
import { ShiftHomeCaption } from "../molecules/ShiftHomeCaption"
import { ShiftLaunchFailureBanner } from "../molecules/ShiftLaunchFailureBanner"
import { ShiftHomeBottomBar } from "../organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "../organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "../organisms/ShiftHomeTopBar"
import {
  type ShiftHomeInputItem,
  type ShiftHomeItem,
  useShiftHome,
} from "../templates/ShiftHome.context"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"

const PLACEHOLDER_TIME = "4:24 PM"
const PLACEHOLDER_AVATAR_SRC = "https://i.pravatar.cc/96?u=korri-dual-screen"

export interface ShiftPrimaryDualScreenSurfaceProps {
  readonly items: ReadonlyArray<ShiftHomeInputItem>
  readonly launch: LaunchController
}

export function ShiftPrimaryDualScreenSurface({
  items,
  launch,
}: ShiftPrimaryDualScreenSurfaceProps) {
  return (
    <ShiftHomeRoot items={items}>
      <ShiftPrimaryFocusPublisher />
      <ShiftHomeTopBar
        time={PLACEHOLDER_TIME}
        avatarSrc={PLACEHOLDER_AVATAR_SRC}
      />
      <ShiftPrimaryLaunchSurface launch={launch} />
      <ShiftHomeBottomBar />
    </ShiftHomeRoot>
  )
}

function ShiftPrimaryFocusPublisher() {
  const { focused } = useShiftHome()
  const { focusGame } = useDualScreenSession()

  useEffect(() => {
    focusGame(focused.id, "primary")
  }, [focused.id, focusGame])

  return null
}

function ShiftPrimaryLaunchSurface({
  launch,
}: {
  readonly launch: LaunchController
}) {
  const { items } = useShiftHome()

  const failedGame = failedGameFor(items, launch.state)

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
      <ShiftHomeRail
        onItemClick={game =>
          launch.start({ ...asPlayableLibraryEntry(game), source: game.source })
        }
      />
      <ShiftHomeCaption />
    </div>
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
