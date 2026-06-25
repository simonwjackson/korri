import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { LibraryRail } from "./LibraryRail"

const rail = picoGames.slice(0, 5)

export default {
  render: () => <LibraryRail games={rail} focusedIndex={2} />,
} satisfies StorySpec
