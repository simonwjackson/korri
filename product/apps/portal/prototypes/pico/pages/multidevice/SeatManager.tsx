/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Seat / device manager. Reads `picoSeatsAtom`.
 */
import { picoSeatsAtom } from "../../data/pico-devices-atoms"
import { PicoData } from "../../screens/PicoData"
import { SeatList } from "../../ui/organisms/SeatList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function SeatManager() {
  return (
    <PicoData atom={picoSeatsAtom} title="PICO ▸ SEATS">
      {seats => (
        <ScreenShell
          title="PICO ▸ SEATS"
          hints={[
            { key: "a", label: "TOGGLE" },
            { key: "b", label: "BACK" },
          ]}
        >
          <SeatList seats={seats} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
