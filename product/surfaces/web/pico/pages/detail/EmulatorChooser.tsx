/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Emulator / app chooser: which core drives this game. Reads
 * `picoEmulatorChooserAtom` and composes ScreenShell + DetailHead + AppChoiceList.
 */
import { picoEmulatorChooserAtom } from "../../data/pico-detail-atoms"
import { PicoData } from "../../screens/PicoData"
import { DetailHead } from "../../ui/molecules/DetailHead"
import { AppChoiceList } from "../../ui/organisms/AppChoiceList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function EmulatorChooser() {
  return (
    <PicoData atom={picoEmulatorChooserAtom} title="PICO ▸ GAME">
      {({ game, appChoices }) => {
        if (!game) return null
        return (
          <ScreenShell
            title="PICO ▸ GAME"
            hints={[
              { key: "a", label: "USE" },
              { key: "b", label: "BACK" },
            ]}
          >
            <DetailHead game={game} tags="CHOOSE EMULATOR · GBA">
              <p className="pcDet-note">
                A few cores know how to run this one — pick who drives.
              </p>
            </DetailHead>
            <AppChoiceList choices={appChoices} />
          </ScreenShell>
        )
      }}
    </PicoData>
  )
}
