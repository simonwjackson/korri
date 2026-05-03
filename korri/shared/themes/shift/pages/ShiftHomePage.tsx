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
 * Time and avatar are placeholder values for now. They are accepted
 * as composition arguments rather than read from a global so a
 * future variant of the home (with a real clock or a sign-in
 * avatar) is a different `ShiftHomePage`-shaped composition rather
 * than a config flag here.
 */

import { useRpcQuery } from "@shared/api/rpc/useRpcQuery"
import type { GameRecord } from "@shared/fixtures/games/game"
import { ShiftHomeCaption } from "../molecules/ShiftHomeCaption"
import { ShiftHomeBottomBar } from "../organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "../organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "../organisms/ShiftHomeTopBar"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"

const PLACEHOLDER_TIME = "4:24 PM"
const PLACEHOLDER_AVATAR_SRC = "https://i.pravatar.cc/96?u=korri-shift-user"

export function ShiftHomePage() {
  const { data, isPending, isError, refetch } = useRpcQuery(client =>
    client.app["library.list"]({}),
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
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
        <ShiftHomeRail />
        <ShiftHomeCaption />
      </div>
      <ShiftHomeBottomBar />
    </ShiftHomeRoot>
  )
}
