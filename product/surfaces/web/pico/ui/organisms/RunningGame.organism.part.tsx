import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { RunningGame } from "./RunningGame"

const hero = picoGames[0]

export default {
  presentation: "surface", // full-bleed stage backdrop
  render: () => (hero ? <RunningGame game={hero} /> : null),
} satisfies StorySpec
