import { picoHero } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { LaunchingStage } from "./LaunchingStage"

export default {
  render: () => (picoHero ? <LaunchingStage game={picoHero} /> : null),
} satisfies StorySpec
