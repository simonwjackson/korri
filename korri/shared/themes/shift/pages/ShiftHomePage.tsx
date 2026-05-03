/**
 * Shift page — home.
 *
 * The composition root that assembles the Shift home from atoms,
 * molecules, organisms, and the template Root. Per the React skill,
 * this file is the seam where data sources are picked.
 *
 * Data: `useRpcQuery(c => c.app["library.list"]({}))` against the
 * server-side ROCKNIX adapter (Unit 6 of the personal-MVP plan).
 * Loading / error / empty states are rendered inline as minimal
 * placeholders so the home can ship without dedicated molecules
 * for those states; observable behavior is covered by BDD against
 * the real dev stack.
 *
 * Launch: `<ShiftHomeLaunchSurface>` lives inside the ShiftHomeRoot
 * tree so it can read `useShiftHome().focused`, drive `useGameLaunch`
 * off the focused id, and render `ShiftLaunchFailureBanner` when a
 * launch fails. The rail keeps its tile / focus / position behind
 * the banner — SGR-R7 "anchored to the same game/context".
 *
 * Time and avatar are placeholder values for now. They are accepted
 * as composition arguments rather than read from a global so a
 * future variant of the home (with a real clock or a sign-in
 * avatar) is a different `ShiftHomePage`-shaped composition rather
 * than a config flag here.
 */

import { useGameLaunch } from "@app/features/resume/launch-controller"
import { useRpcQuery } from "@shared/api/rpc/useRpcQuery"
import {
  type GameRecord,
  getGameDisplayName,
} from "@shared/fixtures/games/game"
import { ShiftHomeCaption } from "../molecules/ShiftHomeCaption"
import { ShiftLaunchFailureBanner } from "../molecules/ShiftLaunchFailureBanner"
import { ShiftHomeBottomBar } from "../organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "../organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "../organisms/ShiftHomeTopBar"
import { useShiftHome } from "../templates/ShiftHome.context"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"

const PLACEHOLDER_TIME = "4:24 PM"
const PLACEHOLDER_AVATAR_SRC = "https://i.pravatar.cc/96?u=korri-shift-user"

export function ShiftHomePage() {
  const { data, isPending, isError, refetch } = useRpcQuery(client =>
    client["app.library.list"]({}),
  )

  // Loading: nothing decoded yet.
  if (isPending && !data) {
    return (
      <main
        data-shift-home
        className="relative flex h-screen w-full flex-col items-center justify-center text-[color:var(--shift-ink)]"
      >
        <p className="opacity-70">Loading library…</p>
      </main>
    )
  }

  // Error: brief inline message + retry. BDD asserts on the visible text.
  if (isError) {
    return (
      <main
        data-shift-home
        className="relative flex h-screen w-full flex-col items-center justify-center gap-2 text-[color:var(--shift-ink)]"
      >
        <p className="opacity-90">Could not load library.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="underline opacity-90"
        >
          Retry
        </button>
      </main>
    )
  }

  const items: ReadonlyArray<GameRecord> = data?.games ?? []

  // Empty: data loaded but no games. ShiftHomeRoot requires at least one
  // item, so we render an explicit placeholder rather than mounting it
  // with an empty list.
  if (items.length === 0) {
    return (
      <main
        data-shift-home
        className="relative flex h-screen w-full flex-col items-center justify-center text-[color:var(--shift-ink)]"
      >
        <p className="opacity-70">No games found.</p>
      </main>
    )
  }

  return (
    <ShiftHomeRoot items={items}>
      <ShiftHomeTopBar
        time={PLACEHOLDER_TIME}
        avatarSrc={PLACEHOLDER_AVATAR_SRC}
      />
      <ShiftHomeLaunchSurface />
      <ShiftHomeBottomBar />
    </ShiftHomeRoot>
  )
}

/**
 * Mid-region wrapper that drives the launch state machine off the
 * currently-focused tile and renders the failure banner above the rail
 * when a launch fails. Lives inside this file because it is a one-off
 * composition between ShiftHomeRoot, useGameLaunch, and the failure
 * banner — not a reusable molecule.
 */
function ShiftHomeLaunchSurface() {
  const { items, focused } = useShiftHome()
  const { status, lastError, failedId, launch, retry } = useGameLaunch(
    focused.id,
  )

  // Title resolution: per SGR-R7, the banner identifies the *failed*
  // game even if the player has since moved focus. Look up the failed id
  // in the loaded items; fall back to the id itself when nothing matches.
  const failedGame =
    failedId !== undefined
      ? (items.find(g => g.id === failedId) ?? { id: failedId })
      : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
      {status === "failed" && failedGame ? (
        <ShiftLaunchFailureBanner
          gameTitle={getGameDisplayName(failedGame)}
          exitCode={lastError?.exitCode}
          onRetry={retry}
        />
      ) : null}
      <ShiftHomeRail onItemClick={game => launch(game.id)} />
      <ShiftHomeCaption />
    </div>
  )
}
