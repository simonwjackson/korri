/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Network & streaming (static).
 */
import { BlockBar, Opt, Toggle } from "../../screens/kit"
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
        <SettingRow label="Wi-Fi" sel>
          <Toggle on />
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
          <Toggle on />
        </SettingRow>
      </div>
    </ScreenShell>
  )
}
