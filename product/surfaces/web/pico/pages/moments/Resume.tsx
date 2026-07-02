/**
 * pico surface. ATOMIC LAYER: page.
 * SHOWCASE moment — resume right where you left off. Reads picoHeroAtom.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { MomentHero } from "../../ui/organisms/MomentHero"

export function Resume() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ RESUME">
      {game =>
        game ? (
          <MomentHero
            statusTitle="PICO ▸ RESUME"
            hints={[
              { key: "a", label: "CONTINUE" },
              { key: "y", label: "RESTART" },
              { key: "b", label: "LIBRARY" },
            ]}
            game={game}
            kicker="▸ RIGHT WHERE YOU LEFT OFF"
          >
            <div
              className="pcM-save"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMSave)}
            >
              <span
                className="pcM-slot"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMSlot)}
              >
                SAVE · CITY OF TEARS
              </span>
              <span
                className="pcM-meta"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMMeta)}
              >
                68% · {game.lastPlayedLabel ?? "recently"}
              </span>
            </div>
            <div
              className="pcM-progress"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMProgress)}
            >
              <div
                className="pcM-progress-fill"
                style={{ width: "68%" }}
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMProgressFill)}
              />
            </div>
            <span
              className="pcM-cta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMCta)}
            >
              <PicoIcon name="play" /> CONTINUE
            </span>
          </MomentHero>
        ) : null
      }
    </PicoData>
  )
}
