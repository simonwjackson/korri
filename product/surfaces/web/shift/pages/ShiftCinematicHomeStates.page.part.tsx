/**
 * Gallery part — the cinematic home across EVERY launch state.
 *
 * The entries come from `LAUNCH_STATE_VARIANTS` (derived from LaunchState.tags),
 * the same single source the lab "Launch" knob reads — so the wall and the knob
 * can never disagree, and adding a launch case makes both pick it up. The parts
 * gallery fans the exported array out into one framed entry per state. This is
 * the derive-don't-author pattern made real: the home is the live component, the
 * states come from the machine, and only the sample values are hand-supplied.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_CINEMATIC_GAMES } from "../config"
import { LAUNCH_STATE_VARIANTS } from "../shift-launch-preview"
import { ShiftCinematicHome } from "./ShiftCinematicHome"

export const ShiftCinematicHomeStates = LAUNCH_STATE_VARIANTS.map(variant => ({
  id: `shift-cinematic-home-launch-${variant.tag.toLowerCase()}`,
  layer: "page" as const,
  name: `Home · ${variant.label}`,
  note: "Launch states",
  surface: true,
  render: () => (
    <ShiftCinematicHome
      games={SHIFT_CINEMATIC_GAMES}
      launchState={variant.value}
    />
  ),
})) satisfies readonly Story[]
