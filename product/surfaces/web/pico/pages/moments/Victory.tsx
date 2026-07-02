/**
 * pico surface. ATOMIC LAYER: page.
 * SHOWCASE moment — you beat it (achievement payoff). Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
import { PicoData } from "../../screens/PicoData"
import { MomentHero } from "../../ui/organisms/MomentHero"

export function Victory() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ VICTORY">
      {games => {
        const game =
          games.find(candidate => candidate.title === "Celeste") ?? games[0]
        const next =
          games.find(candidate => candidate.title === "Hades") ?? games[1]
        if (!game) return null
        return (
          <MomentHero
            statusTitle="PICO ▸ VICTORY"
            hints={[
              { key: "a", label: "WHAT'S NEXT" },
              { key: "y", label: "SHARE" },
              { key: "b", label: "BACK" },
            ]}
            game={game}
            kicker="★ YOU BEAT IT ★"
          >
            <div className="pcM-badge">
              <PicoIcon name="star" /> NO HIT
              <span className="pcM-rarity">EPIC</span>
            </div>
            {next ? (
              <div className="pcM-next">NEXT UP · {next.title}</div>
            ) : null}
            <span className="pcM-cta">
              <PicoIcon name="play" />{" "}
              {next ? `PLAY ${next.title.toUpperCase()}` : "CONTINUE"}
            </span>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}
