import { picoSaveSlots } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { SaveSlotGrid } from "./SaveSlotGrid"

export default {
  render: () => <SaveSlotGrid slots={picoSaveSlots} mode="load" />,
} satisfies StorySpec
