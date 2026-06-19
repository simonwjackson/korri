/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Release picker: the flavors a cart ships in. Reads `picoReleasePickerAtom` and
 * composes ScreenShell + DetailHead + ReleaseList.
 */
import { picoReleasePickerAtom } from "../../data/pico-detail-atoms"
import { PicoData } from "../../screens/PicoData"
import { DetailHead } from "../../ui/molecules/DetailHead"
import { ReleaseList } from "../../ui/organisms/ReleaseList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function ReleasePicker() {
  return (
    <PicoData atom={picoReleasePickerAtom} title="PICO ▸ GAME">
      {({ game, releases }) => {
        if (!game) return null
        return (
          <ScreenShell
            title="PICO ▸ GAME"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "b", label: "BACK" },
            ]}
          >
            <DetailHead
              game={game}
              tags={`${game.genre.toUpperCase()} · ${game.developer.toUpperCase()}`}
            >
              <p className="pcDet-note">
                This cart ships in a few flavors — pick the one you want to boot.
              </p>
            </DetailHead>
            <ReleaseList releases={releases} />
          </ScreenShell>
        )
      }}
    </PicoData>
  )
}
