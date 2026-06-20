import { picoSaveSlots } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { type SaveSlot, SaveSlotGrid } from "./SaveSlotGrid"

const slots: readonly SaveSlot[] = picoSaveSlots.map(slot => ({
  index: slot.index,
  label: slot.label,
  stamp: slot.stamp ?? "",
  empty: slot.empty,
}))

export default {
  render: () => <SaveSlotGrid slots={slots} mode="load" />,
} satisfies StorySpec
