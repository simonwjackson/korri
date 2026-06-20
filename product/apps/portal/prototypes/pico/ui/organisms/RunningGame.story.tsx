import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { RunningGame } from "./RunningGame"

const hero = picoGames[0]

export default {
  surface: true, // full-bleed stage backdrop
  render: () => (hero ? <RunningGame game={hero} /> : null),
} satisfies StorySpec
