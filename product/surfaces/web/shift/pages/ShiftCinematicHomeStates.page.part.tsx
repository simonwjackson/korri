/**
 * Gallery part — the cinematic home across EVERY launch state.
 *
 * The entries are derived from `LaunchState.tags` via `stateVariants`, not
 * hand-listed: the producer below is keyed by every launch case, so adding a
 * new state to the machine makes this file fail to compile until the new state
 * is given a representative value here. The parts gallery fans the exported
 * array out into one framed entry per state. This is the derive-don't-author
 * pattern made real — the home is the live component, the states come from the
 * machine, and only the sample values are hand-supplied taste.
 */
import { LaunchState } from "@platform/library/launch-state"
import { stateVariants } from "@platform/state/state-variants"
import type { Story } from "@tools/theme-workshop"
import { SHIFT_CINEMATIC_GAMES } from "../config"
import { ShiftCinematicHome } from "./ShiftCinematicHome"

const GAME = SHIFT_CINEMATIC_GAMES[0]?.id ?? "demo"

const launchStates = stateVariants<LaunchState["_tag"], LaunchState>(
  LaunchState,
  {
    Idle: () => LaunchState.idle,
    Launching: () => LaunchState.launching(GAME),
    Launched: () => ({ _tag: "Launched", gameId: GAME }),
    ReleaseSelectionRequired: () =>
      LaunchState.releaseSelectionRequired(GAME, ["steam", "gog"]),
    Unavailable: () => LaunchState.unavailable(GAME),
    Failed: () => ({
      _tag: "Failed",
      gameId: GAME,
      exitCode: 121,
      failureKind: "session-busy",
    }),
    Defect: () => ({ _tag: "Defect", gameId: GAME, defect: "preview" }),
  },
)

export const ShiftCinematicHomeStates = launchStates.map(variant => ({
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
