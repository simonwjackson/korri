/**
 * pico surface. ATOMIC LAYER: page.
 * SHOWCASE moment — ready to play (acquisition payoff). Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { MomentHero } from "../../ui/organisms/MomentHero"

export function FreshInstall() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ READY">
      {games => {
        const game = games[7] ?? games[0]
        if (!game) return null
        return (
          <MomentHero
            statusTitle="PICO ▸ READY"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "DETAILS" },
              { key: "b", label: "LIBRARY" },
            ]}
            game={game}
            kicker={
              <>
                <span
                  className="pcM-new"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMNew)}
                >
                  ★ NEW
                </span>{" "}
                READY TO PLAY
              </>
            }
          >
            <div
              className="pcM-meta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMMeta)}
            >
              INSTALLED · 2.4 GB · ALL SET
            </div>
            <span
              className="pcM-cta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMCta)}
            >
              <PicoIcon name="play" /> PLAY NOW
            </span>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}
