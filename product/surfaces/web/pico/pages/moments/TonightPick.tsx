/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * SHOWCASE moment — one confident recommendation. Reads picoShowcaseAtom.
 */
import { picoShowcaseAtom } from "../../data/pico-library-atoms"
import { PicoIcon } from "../../PicoIcon"
import { PicoData } from "../../screens/PicoData"
import { MomentHero } from "../../ui/organisms/MomentHero"

export function TonightPick() {
  return (
    <PicoData atom={picoShowcaseAtom} title="PICO ▸ TONIGHT">
      {({ games, recent }) => {
        const pick = games[1] ?? games[0]
        const reason = recent[0]?.title ?? games[0]?.title ?? "your favorites"
        if (!pick) return null
        return (
          <MomentHero
            statusTitle="PICO ▸ TONIGHT"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "SHUFFLE" },
              { key: "b", label: "BACK" },
            ]}
            game={pick}
            kicker={`▸ BECAUSE YOU PLAYED ${reason.toUpperCase()}`}
          >
            <div className="pcM-meta">
              {pick.genre.toUpperCase()} · {pick.developer.toUpperCase()}
            </div>
            <div className="pcM-actions">
              <span className="pcM-cta">
                <PicoIcon name="play" /> PLAY
              </span>
              <span className="pcM-cta ghost">
                <PicoIcon name="restart" /> SHUFFLE
              </span>
            </div>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}
