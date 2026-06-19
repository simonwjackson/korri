/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Labs panel (static, modal).
 */
import { BlockBar, Modal, Toggle } from "../../screens/kit"
import { SettingRow } from "../../ui/molecules/SettingRow"

export function LabsPanel() {
  return (
    <Modal
      title="β LABS"
      hints={[
        { key: "a", label: "TOGGLE" },
        { key: "b", label: "CLOSE" },
      ]}
    >
      <p className="pcSet-modal-desc">
        Knobs we're still messing with. Flip at your own risk.
      </p>
      <div className="pcSet-list">
        <SettingRow label="UI Scale" sel>
          <BlockBar level={5} max={10} />
        </SettingRow>
        <SettingRow label="Holographic Carts">
          <Toggle on />
        </SettingRow>
        <SettingRow label="Predictive Preload">
          <Toggle on={false} />
        </SettingRow>
      </div>
    </Modal>
  )
}
