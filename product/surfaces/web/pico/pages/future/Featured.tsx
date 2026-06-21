/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Featured / game of the day. Reads `picoFeaturedAtom`.
 */
import { picoFeaturedAtom } from "../../data/pico-social-atoms"
import { PicoData } from "../../screens/PicoData"
import { FeaturedToday } from "../../ui/organisms/FeaturedToday"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Featured() {
  return (
    <PicoData atom={picoFeaturedAtom} title="PICO ▸ TODAY">
      {({ hero, games }) => {
        if (!hero) return null
        return (
          <ScreenShell
            title="PICO ▸ TODAY"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "DETAILS" },
              { key: "b", label: "BACK" },
            ]}
          >
            <FeaturedToday hero={hero} more={games.slice(0, 4)} />
          </ScreenShell>
        )
      }}
    </PicoData>
  )
}
