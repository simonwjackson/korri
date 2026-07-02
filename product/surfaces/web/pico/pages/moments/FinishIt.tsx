/**
 * pico surface. ATOMIC LAYER: page.
 * SHOWCASE moment — one boss left (completion nudge). Reads picoHeroAtom.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { MomentHero } from "../../ui/organisms/MomentHero"

export function FinishIt() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ FINISH IT">
      {game =>
        game ? (
          <MomentHero
            statusTitle="PICO ▸ FINISH IT"
            hints={[
              { key: "a", label: "CONTINUE" },
              { key: "y", label: "INFO" },
              { key: "b", label: "BACK" },
            ]}
            game={game}
            kicker="▸ ONE BOSS LEFT"
          >
            <div
              className="pcM-meta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMMeta)}
            >
              92% COMPLETE · THE FINAL FIGHT AWAITS
            </div>
            <div
              className="pcM-progress"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMProgress)}
            >
              <div
                className="pcM-progress-fill"
                style={{ width: "92%" }}
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMProgressFill)}
              />
            </div>
            <span
              className="pcM-cta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMCta)}
            >
              <PicoIcon name="play" /> FINISH THE FIGHT
            </span>
          </MomentHero>
        ) : null
      }
    </PicoData>
  )
}
