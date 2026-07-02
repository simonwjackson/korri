/**
 * pico surface. ATOMIC LAYER: page.
 * Controller input remap (static). Modal shell + RemapList.
 */

import { Title } from "../../ui/atoms/Title"
import { Modal } from "../../ui/organisms/Modal"
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
