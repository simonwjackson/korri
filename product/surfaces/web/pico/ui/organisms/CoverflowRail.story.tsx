import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { CoverflowRail } from "./CoverflowRail"

const rail = picoGames.slice(0, 5)

export default {
  render: () => <CoverflowRail games={rail} activeIndex={2} />,
} satisfies StorySpec
