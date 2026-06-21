import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { GameCart } from "./GameCart"

const hero = picoGames[0]

export default {
  render: () =>
    hero ? (
      <div className="pc-art sm">
        <GameCart game={hero} />
      </div>
    ) : null,
} satisfies StorySpec
