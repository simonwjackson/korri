import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { KeyArtBackdrop } from "./KeyArtBackdrop"

const hero = picoGames[0]

export default {
  render: () =>
    hero ? <KeyArtBackdrop src={hero.heroUrl} scale={2.6} /> : null,
} satisfies StorySpec
