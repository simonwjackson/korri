/**
 * Deck Actions molecule catalog entry — prev / Play / Favorite / next, in its
 * unfavorited and favorited states.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDeckActions } from "./ShiftDeckActions"

export const ShiftDeckActionsStates = [
  { state: "Unfavorited", favored: false },
  { state: "Favorited", favored: true },
].map(({ state, favored }) => ({
  id: `shift-deck-actions-${state.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.deckActions.id,
  layer: "molecule" as const,
  name: "Deck Actions",
  note: "Action states",
  state,
  render: () => (
    <ShiftPartFrame height={100}>
      <ShiftDeckActions
        favored={favored}
        onPrev={() => undefined}
        onNext={() => undefined}
        onPlay={() => undefined}
        onToggleFavorite={() => undefined}
      />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
