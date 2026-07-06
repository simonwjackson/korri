/**
 * EXPLORATION (throwaway): button-row placement takes for the Cinematic Home.
 *
 * Renders the real `ShiftCinematicHome` scene (fixtures only) with each
 * `legendPlacement` take so the dev lab can toggle between them and compare
 * where the A/X/Y hint row should live. This whole file, the `legendPlacement`
 * prop on `ShiftCinematicHome`, its `ShiftLegendPlacement` type, and the
 * `[data-legend-placement]` block in `shift.css` are meant to be deleted
 * together once a placement is chosen.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_CINEMATIC_GAMES } from "./config"
import {
  ShiftCinematicHome,
  type ShiftLegendPlacement,
} from "./pages/ShiftCinematicHome"
import { SHIFT_DESIGN_PARTS } from "./shift-design-parts"

const AVATAR = "https://i.pravatar.cc/96?u=korri-shift-user"

function take(
  placement: ShiftLegendPlacement,
  state: string,
  note: string,
): Story {
  return {
    id: `shift-home-button-row-${placement}`,
    designPartId: SHIFT_DESIGN_PARTS.homeTemplate.id,
    layer: "template",
    name: "Home Button Row",
    note,
    surface: true,
    state,
    render: () => (
      <ShiftCinematicHome
        games={SHIFT_CINEMATIC_GAMES}
        time="4:24 PM"
        avatarSrc={AVATAR}
        legendPlacement={placement}
      />
    ),
  }
}

export const ShiftHomeButtonRowTakes: readonly Story[] = [
  take(
    "hero-band",
    "B — Hero band (info-left / actions-right)",
    "Hero + hints share one baseline above the rail; wraps on narrow frames.",
  ),
  take(
    "footer",
    "A — Footer below the rail",
    "Conventional console legend as the true bottom edge.",
  ),
  take(
    "center",
    "C — Centered above the rail",
    "Hints centered over the focused (centered) tile.",
  ),
  take(
    "above-rail",
    "Current — Right, above the rail",
    "The shipping placement, for reference.",
  ),
]
