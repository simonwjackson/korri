import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { GameLogo } from "./GameLogo"

const hero = picoGames[0]

export default {
  note: "logo art / typeset fallback",
  render: () => (
    <>
      {hero ? (
        <GameLogo logoUrl={hero.logoUrl} title={hero.title} scale={2.4} />
      ) : null}
      {hero ? (
        <GameLogo logoUrl={null} title={hero.title} titleSize={2} />
      ) : null}
    </>
  ),
} satisfies StorySpec
