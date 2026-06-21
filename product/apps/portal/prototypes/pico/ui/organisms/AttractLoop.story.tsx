import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { AttractLoop } from "./AttractLoop"

export default {
  presentation: "surface", // full-bleed starfield attract screen
  render: () => <AttractLoop games={picoGames} />,
} satisfies StorySpec
