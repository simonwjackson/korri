/**
 * pico surface. ATOMIC LAYER: page.
 * SHOWCASE moment — owned but never played (backlog rescue). Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { MomentHero } from "../../ui/organisms/MomentHero"

export function Backlog() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ BACKLOG">
      {games => {
        const game =
          games.find(g => g.lastPlayedAt === null && g.logoUrl) ??
          games.find(g => g.lastPlayedAt === null) ??
          games[3]
        if (!game) return null
        return (
          <MomentHero
            statusTitle="PICO ▸ BACKLOG"
            hints={[
              { key: "a", label: "GIVE IT A GO" },
              { key: "y", label: "NOT TONIGHT" },
              { key: "b", label: "BACK" },
            ]}
            game={game}
            kicker="▸ STILL IN YOUR BACKLOG"
          >
            <div
              className="pcM-meta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMMeta)}
            >
              ADDED 3 MONTHS AGO · NEVER PLAYED
            </div>
            <div
              className="pcM-actions"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMActions)}
            >
              <span
                className="pcM-cta"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMCta)}
              >
                <PicoIcon name="play" /> GIVE IT A SHOT
              </span>
              <span
                className="pcM-cta ghost"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMCta)}
              >
                <PicoIcon name="close" /> NOT TONIGHT
              </span>
            </div>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}
