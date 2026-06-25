import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { MiniHome } from "./MiniHome"

const rail = picoGames.slice(0, 5)

export default {
  render: () => <MiniHome games={rail} focusIndex={1} />,
} satisfies StorySpec
