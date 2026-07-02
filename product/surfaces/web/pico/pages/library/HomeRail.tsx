/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Library home: a focused coverflow rail + a caption for the focused cart. Reads
 * `picoGamesAtom`, composes ScreenShell + LibraryRail.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { Sub } from "../../ui/atoms/Sub"
import { Title } from "../../ui/atoms/Title"
import { LibraryRail } from "../../ui/organisms/LibraryRail"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function HomeRail() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ HOME">
      {games => {
        const rail = games.slice(0, 5)
        const focused = rail[2] ?? games[0]
        if (!focused) return null
        return (
          <ScreenShell
            title="PICO ▸ HOME"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "OPTIONS" },
            ]}
          >
            <LibraryRail games={rail} focusedIndex={2} />
            <div
              className="pcLib-caption"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcLibCaption)}
            >
              <Title size={1}>{focused.title}</Title>
              <Sub>{focused.genre}</Sub>
              <div
                className="pc-dim"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
              >
                {focused.lastPlayedLabel
                  ? `LAST PLAYED ${focused.lastPlayedLabel}`
                  : "NEVER PLAYED"}
              </div>
            </div>
          </ScreenShell>
        )
      }}
    </PicoData>
  )
}
