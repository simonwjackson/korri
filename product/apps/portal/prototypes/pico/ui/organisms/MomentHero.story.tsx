import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { MomentHero } from "./MomentHero"

const hero = picoGames[0]

export default {
  surface: true, // renders a full ScreenShell
  render: () =>
    hero ? (
      <MomentHero
        statusTitle="PICO ▸ RESUME"
        hints={[
          { key: "a", label: "CONTINUE" },
          { key: "b", label: "BACK" },
        ]}
        game={hero}
        kicker="▸ RIGHT WHERE YOU LEFT OFF"
      >
        <div className="pcM-meta">68% · CITY OF TEARS</div>
      </MomentHero>
    ) : null,
} satisfies StorySpec
