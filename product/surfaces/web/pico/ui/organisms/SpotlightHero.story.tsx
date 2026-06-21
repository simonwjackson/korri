import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { SpotlightHero } from "./SpotlightHero"

const hero = picoGames[0]

export default {
  presentation: "surface", // children are absolutely positioned against the .pcShow-spot stage
  render: () =>
    hero ? (
      <div className="pcShow-spot">
        <SpotlightHero hero={hero} playState="continue" />
      </div>
    ) : null,
} satisfies StorySpec
