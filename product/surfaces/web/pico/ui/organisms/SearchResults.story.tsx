import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { SearchResults } from "./SearchResults"

const games = picoGames.slice(0, 4)

export default {
  render: () => <SearchResults games={games} />,
} satisfies StorySpec
