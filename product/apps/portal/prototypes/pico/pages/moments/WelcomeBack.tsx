/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * SHOWCASE moment — personable re-entry (Pixl-led). Reads picoHeroAtom.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
import { PicoMascot } from "../../PicoMascot"
import { PicoData } from "../../screens/PicoData"
import { MomentHero } from "../../ui/organisms/MomentHero"

export function WelcomeBack() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ WELCOME">
      {game =>
        game ? (
          <MomentHero
            statusTitle="PICO ▸ WELCOME"
            hints={[
              { key: "a", label: "CONTINUE" },
              { key: "y", label: "WHAT'S NEW" },
              { key: "b", label: "HOME" },
            ]}
            game={game}
            kicker="▸ WELCOME BACK"
          >
            <div className="pcM-greet">
              <PicoMascot state="happy" className="pcM-greet-pixl" />
              <span>it&apos;s been 3 days — your crew missed you</span>
            </div>
            <div className="pcM-meta">
              WHILE YOU WERE GONE · 8BITBEN BEAT YOUR SCORE
            </div>
            <span className="pcM-cta">
              <PicoIcon name="play" /> JUMP BACK IN
            </span>
          </MomentHero>
        ) : null
      }
    </PicoData>
  )
}
