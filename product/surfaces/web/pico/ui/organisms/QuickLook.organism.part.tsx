import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { QuickLook } from "./QuickLook"

const hero = picoGames[0]

export default {
  render: () => (hero ? <QuickLook game={hero} /> : null),
} satisfies StorySpec
