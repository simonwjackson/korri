import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { DualPrimaryStage } from "./DualPrimaryStage"

const hero = picoGames[0]

export default {
  render: () => (hero ? <DualPrimaryStage hero={hero} /> : null),
} satisfies StorySpec
