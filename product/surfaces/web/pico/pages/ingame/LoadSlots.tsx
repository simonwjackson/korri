/**
 * pico surface. ATOMIC LAYER: page.
 * Load-state slots. Reads `picoSaveSlotsAtom`; Modal is the in-session shell.
 */
import { picoSaveSlotsAtom } from "../../data/pico-ingame-atoms"
import { PicoData } from "../../screens/PicoData"
import { Modal } from "../../ui/organisms/Modal"
import { SaveSlotGrid } from "../../ui/organisms/SaveSlotGrid"

export function LoadSlots() {
  return (
    <PicoData atom={picoSaveSlotsAtom} title="LOAD STATE">
      {slots => (
        <Modal
          title="LOAD STATE"
          hints={[
            { key: "a", label: "RESTORE" },
            { key: "b", label: "BACK" },
          ]}
        >
          <SaveSlotGrid slots={slots} mode="load" />
        </Modal>
      )}
    </PicoData>
  )
}
