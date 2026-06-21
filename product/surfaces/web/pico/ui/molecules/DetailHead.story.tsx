import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { DetailHead } from "./DetailHead"

const hero = picoGames[0]

export default {
  render: () =>
    hero ? (
      <DetailHead game={hero} tags={`${hero.genre} · ${hero.developer}`}>
        <p className="pcDet-note">A reusable detail header.</p>
      </DetailHead>
    ) : null,
} satisfies StorySpec
