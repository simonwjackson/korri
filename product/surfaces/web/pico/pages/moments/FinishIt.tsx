/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * SHOWCASE moment — one boss left (completion nudge). Reads picoHeroAtom.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
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
            <div className="pcM-meta">
              92% COMPLETE · THE FINAL FIGHT AWAITS
            </div>
            <div className="pcM-progress">
              <div className="pcM-progress-fill" style={{ width: "92%" }} />
            </div>
            <span className="pcM-cta">
              <PicoIcon name="play" /> FINISH THE FIGHT
            </span>
          </MomentHero>
        ) : null
      }
    </PicoData>
  )
}
