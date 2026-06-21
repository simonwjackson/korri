/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Screenshot gallery for a game. Reads `picoMediaGalleryAtom` and composes
 * ScreenShell + ScreenshotGallery.
 */
import { picoMediaGalleryAtom } from "../../data/pico-detail-atoms"
import { PicoData } from "../../screens/PicoData"
import { ScreenshotGallery } from "../../ui/organisms/ScreenshotGallery"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function MediaGallery() {
  return (
    <PicoData atom={picoMediaGalleryAtom} title="PICO ▸ GAME">
      {({ game, games }) => {
        if (!game) return null
        return (
          <ScreenShell
            title="PICO ▸ GAME"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "NEXT" },
              { key: "b", label: "BACK" },
            ]}
          >
            <ScreenshotGallery game={game} shots={games} />
          </ScreenShell>
        )
      }}
    </PicoData>
  )
}
