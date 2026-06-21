/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Console / system picker. Reads `picoSystemsAtom`, composes ScreenShell +
 * SystemGrid.
 */
import { picoSystemsAtom } from "../../data/pico-catalog-atoms"
import { PicoData } from "../../screens/PicoData"
import { Title } from "../../ui/atoms/Title"
import { SystemGrid } from "../../ui/organisms/SystemGrid"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function ConsolePicker() {
  return (
    <PicoData atom={picoSystemsAtom} title="PICO ▸ SYSTEMS">
      {systems => (
        <ScreenShell
          title="PICO ▸ SYSTEMS"
          hints={[
            { key: "a", label: "OPEN" },
            { key: "b", label: "BACK" },
          ]}
        >
          <Title size={0}>CHOOSE A SYSTEM</Title>
          <SystemGrid systems={systems} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
