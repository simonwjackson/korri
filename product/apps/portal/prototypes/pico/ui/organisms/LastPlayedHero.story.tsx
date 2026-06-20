import { picoHero } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { LastPlayedHero } from "./LastPlayedHero"

const backdrop = picoHero?.heroUrl ?? picoHero?.art
const meta = [picoHero?.lastPlayedLabel, picoHero?.playtimeLabel]
  .filter(Boolean)
  .join(" · ")

export default {
  surface: true, // full-bleed key-art backdrop fills the absolute `.pcLast` stage
  render: () =>
    picoHero ? (
      <div className="pcLast">
        <LastPlayedHero game={picoHero} backdrop={backdrop} meta={meta} />
      </div>
    ) : null,
} satisfies StorySpec
