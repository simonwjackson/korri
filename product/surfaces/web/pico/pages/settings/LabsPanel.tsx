/**
 * pico surface. ATOMIC LAYER: page. Labs panel (static, modal).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { BlockBar } from "../../ui/atoms/BlockBar"
import { Toggle } from "../../ui/atoms/Toggle"
import { SettingRow } from "../../ui/molecules/SettingRow"
import { Modal } from "../../ui/organisms/Modal"

export function LabsPanel() {
  return (
    <Modal
      title="β LABS"
      hints={[
        { key: "a", label: "TOGGLE" },
        { key: "b", label: "CLOSE" },
      ]}
    >
      <p
        className="pcSet-modal-desc"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetModalDesc)}
      >
        Knobs we're still messing with. Flip at your own risk.
      </p>
      <div
        className="pcSet-list"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetList)}
      >
        <SettingRow label="UI Scale" state="selected">
          <BlockBar level={5} max={10} />
        </SettingRow>
        <SettingRow label="Holographic Carts">
          <Toggle state="on" />
        </SettingRow>
        <SettingRow label="Predictive Preload">
          <Toggle state="off" />
        </SettingRow>
      </div>
    </Modal>
  )
}
