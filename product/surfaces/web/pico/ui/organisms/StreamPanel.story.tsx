import { picoHero } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { StreamPanel } from "./StreamPanel"

export default {
  render: () => <StreamPanel hero={picoHero} />,
} satisfies StorySpec
