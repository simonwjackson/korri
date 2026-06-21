import { picoHero } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { RepairProgress } from "./RepairProgress"

export default {
  render: () => <RepairProgress target={picoHero} />,
} satisfies StorySpec
