/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Save-state slots. Reads `picoSaveSlotsAtom`; Modal is the in-session shell.
 */
import { picoSaveSlotsAtom } from "../../data/pico-ingame-atoms"
import { PicoData } from "../../screens/PicoData"
import { Modal } from "../../ui/organisms/Modal"
import { SaveSlotGrid } from "../../ui/organisms/SaveSlotGrid"

export function SaveSlots() {
  return (
    <PicoData atom={picoSaveSlotsAtom} title="SAVE STATE">
      {slots => (
        <Modal
          title="SAVE STATE"
          hints={[
            { key: "a", label: "SAVE" },
            { key: "b", label: "BACK" },
          ]}
        >
          <SaveSlotGrid slots={slots} mode="save" />
        </Modal>
      )}
    </PicoData>
  )
}
