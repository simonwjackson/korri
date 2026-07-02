/**
 * Deck Favorite Button atom catalog entry — unfavorited and favorited.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDeckFavoriteButton } from "./ShiftDeckFavoriteButton"

export const ShiftDeckFavoriteButtonStates = [
  { state: "Unfavorited", favored: false },
  { state: "Favorited", favored: true },
].map(({ state, favored }) => ({
  id: `shift-deck-favorite-button-${state.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.deckFavoriteButton.id,
  layer: "atom" as const,
  name: "Deck Favorite Button",
  note: "Favorite states",
  state,
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftDeckFavoriteButton favored={favored} onClick={() => undefined} />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
