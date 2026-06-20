import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { SpotlightHero } from "./SpotlightHero"

const hero = picoGames[0]

export default {
  surface: true, // children are absolutely positioned against the .pcShow-spot stage
  render: () =>
    hero ? (
      <div className="pcShow-spot">
        <SpotlightHero hero={hero} played />
      </div>
    ) : null,
} satisfies StorySpec
