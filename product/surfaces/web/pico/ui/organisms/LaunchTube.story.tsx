import { picoHero } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { LaunchTube } from "./LaunchTube"

export default {
  render: () => <LaunchTube game={picoHero} />,
} satisfies StorySpec
