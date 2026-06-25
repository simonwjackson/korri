import { picoHero } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { JoiningStage } from "./JoiningStage"

export default {
  render: () => <JoiningStage game={picoHero} />,
} satisfies StorySpec
