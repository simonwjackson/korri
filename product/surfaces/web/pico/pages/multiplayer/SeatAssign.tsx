/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Seat & controller assignment. Reads `picoPlayersAtom`.
 */
import { picoPlayersAtom } from "../../data/pico-party-atoms"
import { PicoData } from "../../screens/PicoData"
import { SeatAssignList } from "../../ui/organisms/SeatAssignList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function SeatAssign() {
  return (
    <PicoData atom={picoPlayersAtom} title="PICO ▸ SEATS">
      {players => (
        <ScreenShell
          title="PICO ▸ SEATS"
          hints={[
            { key: "a", label: "SWAP" },
            { key: "y", label: "ADD PAD" },
            { key: "b", label: "DONE" },
          ]}
        >
          <SeatAssignList players={players} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
