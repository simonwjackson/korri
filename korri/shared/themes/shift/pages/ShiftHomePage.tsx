/**
 * Shift page — home.
 *
 * The composition root that assembles the Shift home from atoms,
 * molecules, organisms, and the template Root. Per the React skill,
 * this file is the seam where data sources are picked: today the
 * games fixture is hard-coded; a future server-backed root would
 * swap the prop without changing any composition below.
 *
 * Responsibilities:
 *   - Provide the items list (today, the in-repo games fixture).
 *   - Mount `ShiftHomeRoot` so context is available to children.
 *   - Compose the three regions (top bar, middle column with rail +
 *     caption, bottom bar) as children. The middle wrapper applies
 *     vertical centering (`justify-center`) to the rail/caption pair
 *     so they sit roughly mid-screen on the home surface.
 *
 * Time and avatar are placeholder values for now. They are accepted
 * as composition arguments rather than read from a global so a
 * future variant of the home (with a real clock or a sign-in
 * avatar) is a different `ShiftHomePage`-shaped composition rather
 * than a config flag here.
 */

import { games } from "@shared/fixtures/games/games"
import { ShiftHomeCaption } from "../molecules/ShiftHomeCaption"
import { ShiftHomeBottomBar } from "../organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "../organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "../organisms/ShiftHomeTopBar"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"

const PLACEHOLDER_TIME = "4:24 PM"
const PLACEHOLDER_AVATAR_SRC = "https://i.pravatar.cc/96?u=korri-shift-user"

export function ShiftHomePage() {
  return (
    <ShiftHomeRoot items={games}>
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
