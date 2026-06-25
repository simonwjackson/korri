import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { FeaturedToday } from "./FeaturedToday"

const hero = picoGames[0]
const more = picoGames.slice(1, 5)

export default {
  render: () => (hero ? <FeaturedToday hero={hero} more={more} /> : null),
} satisfies StorySpec
