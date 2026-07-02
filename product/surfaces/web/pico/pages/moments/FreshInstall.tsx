/**
 * pico surface. ATOMIC LAYER: page.
 * SHOWCASE moment — ready to play (acquisition payoff). Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
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
                <span className="pcM-new">★ NEW</span> READY TO PLAY
              </>
            }
          >
            <div className="pcM-meta">INSTALLED · 2.4 GB · ALL SET</div>
            <span className="pcM-cta">
              <PicoIcon name="play" /> PLAY NOW
            </span>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}
