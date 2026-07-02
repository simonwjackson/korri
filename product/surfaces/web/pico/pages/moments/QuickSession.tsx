/**
 * pico surface. ATOMIC LAYER: page.
 * SHOWCASE moment — content-first by available time. Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { MomentHero } from "../../ui/organisms/MomentHero"

export function QuickSession() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ QUICK">
      {games => {
        const pick = games[4] ?? games[0]
        if (!pick) return null
        return (
          <MomentHero
            statusTitle="PICO ▸ QUICK"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "OTHER" },
              { key: "b", label: "BACK" },
            ]}
            game={pick}
            kicker="▸ GOT 20 MINUTES?"
          >
            <div
              className="pcM-tags"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMTags)}
            >
              <span
                className="pcM-tag"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMTag)}
              >
                ~15 MIN RUNS
              </span>
              <span
                className="pcM-tag"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMTag)}
              >
                PICK UP &amp; PLAY
              </span>
            </div>
            <span
              className="pcM-cta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMCta)}
            >
              <PicoIcon name="play" /> PLAY
            </span>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}
