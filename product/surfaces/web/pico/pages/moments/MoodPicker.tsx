/**
 * pico surface. ATOMIC LAYER: page.
 * SHOWCASE moment — curate by feeling, not genre (multi-tile sibling). Reads
 * picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import type { PicoGame } from "../../fixtures"
import { PicoArtImage } from "../../PicoArtImage"
import { PicoData } from "../../screens/PicoData"
import { ScreenShell } from "../../ui/templates/ScreenShell"

const MOODS: readonly { readonly label: string; readonly title: string }[] = [
  { label: "COZY", title: "Stardew Valley" },
  { label: "INTENSE", title: "Hades" },
  { label: "WEIRD", title: "Disco Elysium" },
]

export function MoodPicker() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ MOOD">
      {games => {
        const tiles = MOODS.map((mood, index) => ({
          ...mood,
          game: games.find(g => g.title === mood.title) ?? games[index],
        })).filter((tile): tile is typeof tile & { game: PicoGame } =>
          Boolean(tile.game),
        )
        return (
          <ScreenShell
            title="PICO ▸ MOOD"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "RESHUFFLE" },
              { key: "b", label: "BACK" },
            ]}
            className="pad-0"
          >
            <div className="pcMood">
              <div className="pcMood-kicker">
                ▸ WHAT ARE YOU IN THE MOOD FOR?
              </div>
              <div className="pcMood-tiles">
                {tiles.map((tile, index) => (
                  <div
                    key={tile.label}
                    className={`pcMood-tile ${index === 1 ? "on" : ""}`}
                  >
                    <div className="pcMood-art">
                      {tile.game.art ? (
                        <PicoArtImage
                          src={tile.game.art}
                          className="pcMood-img"
                        />
                      ) : null}
                    </div>
                    <div className="pcMood-label">{tile.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </ScreenShell>
        )
      }}
    </PicoData>
  )
}
