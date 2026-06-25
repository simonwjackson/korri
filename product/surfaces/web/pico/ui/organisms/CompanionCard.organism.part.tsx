import { picoHero } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { CompanionCard } from "./CompanionCard"

export default {
  presentation: "surface", // full-bleed companion art with overlaid title
  render: () => (picoHero ? <CompanionCard hero={picoHero} /> : null),
} satisfies StorySpec
