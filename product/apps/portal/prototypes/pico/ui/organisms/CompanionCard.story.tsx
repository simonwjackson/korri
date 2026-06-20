import { picoHero } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { CompanionCard } from "./CompanionCard"

export default {
  surface: true, // full-bleed companion art with overlaid title
  render: () => (picoHero ? <CompanionCard hero={picoHero} /> : null),
} satisfies StorySpec
