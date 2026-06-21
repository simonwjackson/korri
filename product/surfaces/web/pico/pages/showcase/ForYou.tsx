/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Content-first browse: curated, contextual shelves, each a strip of big art.
 * The anti-pattern this replaces is "choose a system, then an A–Z list". Reads
 * `picoShowcaseAtom`, derives the shelves, and composes `ScreenShell` +
 * `ShelfGrid`.
 */
import { picoShowcaseAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { type Shelf, ShelfGrid } from "../../ui/organisms/ShelfGrid"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function ForYou() {
  return (
    <PicoData atom={picoShowcaseAtom} title="PICO ▸ FOR YOU">
      {({ games, recent }) => {
        const anchor = recent[0]?.title ?? games[0]?.title ?? "YOUR GAMES"
        const shelves: readonly Shelf[] = [
          { title: "CONTINUE", games: recent.slice(0, 6) },
          {
            title: `BECAUSE YOU PLAYED ${anchor.toUpperCase()}`,
            games: games.slice(2, 8),
          },
          { title: "FRESH DROPS", games: games.slice(8, 14) },
          { title: "PICK UP & PLAY", games: games.slice(1, 7) },
        ].filter(shelf => shelf.games.length > 0)

        return (
          <ScreenShell
            title="PICO ▸ FOR YOU"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "INFO" },
              { key: "b", label: "BACK" },
            ]}
            className="pad-0"
          >
            <ShelfGrid shelves={shelves} />
          </ScreenShell>
        )
      }}
    </PicoData>
  )
}
