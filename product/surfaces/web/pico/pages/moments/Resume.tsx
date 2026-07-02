/**
 * pico surface. ATOMIC LAYER: page.
 * SHOWCASE moment — resume right where you left off. Reads picoHeroAtom.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
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
            <div className="pcM-save">
              <span className="pcM-slot">SAVE · CITY OF TEARS</span>
              <span className="pcM-meta">
                68% · {game.lastPlayedLabel ?? "recently"}
              </span>
            </div>
            <div className="pcM-progress">
              <div className="pcM-progress-fill" style={{ width: "68%" }} />
            </div>
            <span className="pcM-cta">
              <PicoIcon name="play" /> CONTINUE
            </span>
          </MomentHero>
        ) : null
      }
    </PicoData>
  )
}
