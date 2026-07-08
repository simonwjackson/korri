/**
 * Detail Button atom catalog entry — primary (play verb), secondary (New
 * Game), and the favourite toggle in both pressed states.
 */
import type { Story } from "@simonwjackson/caliper"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftDetailButton } from "./ShiftDetailButton"

export const ShiftDetailButtonStates = [
  { state: "Primary", props: { primary: true, label: "▶ Continue" } },
  { state: "Secondary", props: { label: "New Game" } },
  { state: "Favorite", props: { pressed: false, label: "☆ Favorite" } },
  { state: "Favorited", props: { pressed: true, label: "★ Favorited" } },
].map(({ state, props }) => ({
  id: `shift-detail-button-${state.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.detailButton.id,
  layer: "atom" as const,
  name: "Detail Button",
  note: "Button states",
  state,
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftDetailButton {...props} onClick={() => undefined} />
    </ShiftPartFrame>
  ),
})) satisfies readonly Story[]
