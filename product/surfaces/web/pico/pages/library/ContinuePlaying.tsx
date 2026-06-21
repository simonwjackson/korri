/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Continue-playing list. Reads `picoRecentAtom`, composes ScreenShell +
 * ContinueList.
 */
import { picoRecentAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { Title } from "../../ui/atoms/Title"
import { ContinueList } from "../../ui/organisms/ContinueList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function ContinuePlaying() {
  return (
    <PicoData atom={picoRecentAtom} title="PICO ▸ CONTINUE">
      {recent => (
        <ScreenShell
          title="PICO ▸ CONTINUE"
          hints={[
            { key: "a", label: "RESUME" },
            { key: "b", label: "BACK" },
          ]}
        >
          <Title size={0}>CONTINUE PLAYING</Title>
          <ContinueList games={recent.slice(0, 5)} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
