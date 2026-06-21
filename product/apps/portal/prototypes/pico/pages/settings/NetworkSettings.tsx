/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Network & streaming (static).
 */
import { BlockBar } from "../../ui/atoms/BlockBar"
import { Toggle } from "../../ui/atoms/Toggle"
import { Opt } from "../../ui/molecules/Opt"
import { SettingRow } from "../../ui/molecules/SettingRow"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function NetworkSettings() {
  return (
    <ScreenShell
      title="PICO ▸ NETWORK"
      hints={[
        { key: "a", label: "ADJUST" },
        { key: "y", label: "FORGET" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcSet-list">
        <SettingRow label="Wi-Fi" state="selected">
          <Toggle state="on" />
        </SettingRow>
        <SettingRow label="Network">
          <span className="pcSet-info">PICO-NET</span>
        </SettingRow>
        <SettingRow label="Stream Quality">
          <Opt value="BALANCED" />
        </SettingRow>
        <SettingRow label="Max Bitrate">
          <BlockBar level={7} max={10} />
        </SettingRow>
        <SettingRow label="Host Discovery">
          <Toggle state="on" />
        </SettingRow>
      </div>
    </ScreenShell>
  )
}
