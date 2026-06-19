/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Controller input remap (static). Modal shell + RemapList.
 */
import { Modal } from "../../screens/kit"
import { Title } from "../../ui/atoms/Title"
import { RemapList } from "../../ui/organisms/RemapList"

export function InputRemap() {
  return (
    <Modal
      title="REMAP CONTROLLER"
      hints={[
        { key: "a", label: "REBIND" },
        { key: "y", label: "RESET" },
        { key: "b", label: "DONE" },
      ]}
    >
      <Title size={-1}>8BITDO PRO 2</Title>
      <RemapList />
    </Modal>
  )
}
