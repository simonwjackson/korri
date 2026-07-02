/**
 * pico surface. ATOMIC LAYER: page. System panel (static, modal).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { BlockBar } from "../../ui/atoms/BlockBar"
import { Icon } from "../../ui/atoms/Icon"
import { SettingRow } from "../../ui/molecules/SettingRow"
import { Modal } from "../../ui/organisms/Modal"

export function SystemPanel() {
  return (
    <Modal
      title={
        <>
          <Icon name="gear" /> SYSTEM
        </>
      }
      hints={[
        { key: "a", label: "ADJUST" },
        { key: "b", label: "CLOSE" },
      ]}
    >
      <p
        className="pcSet-modal-desc"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetModalDesc)}
      >
        The dials that keep this little box happy.
      </p>
      <div
        className="pcSet-list"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetList)}
      >
        <SettingRow label="Brightness" state="selected">
          <BlockBar level={6} max={10} />
        </SettingRow>
        <SettingRow label="Volume">
          <BlockBar level={7} max={10} />
        </SettingRow>
        <SettingRow label="Battery">
          <span
            className="pcSet-info"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetInfo)}
          >
            82% · 3h 40m
          </span>
        </SettingRow>
      </div>
    </Modal>
  )
}
