/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Display & video (static).
 */
import { BlockBar, Opt, Toggle } from "../../screens/kit"
import { SettingRow } from "../../ui/molecules/SettingRow"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function DisplaySettings() {
  return (
    <ScreenShell
      title="PICO ▸ DISPLAY"
      hints={[
        { key: "a", label: "ADJUST" },
        { key: "y", label: "DEFAULTS" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcSet-list">
        <SettingRow label="Brightness" sel>
          <BlockBar level={6} max={10} />
        </SettingRow>
        <SettingRow label="Color Mode">
          <Opt value="VIVID" />
        </SettingRow>
        <SettingRow label="Scanlines">
          <Toggle on />
        </SettingRow>
        <SettingRow label="Integer Scale">
          <Toggle on />
        </SettingRow>
        <SettingRow label="Aspect">
          <Opt value="4:3" />
        </SettingRow>
        <SettingRow label="Shader">
          <Opt value="CRT" />
        </SettingRow>
      </div>
    </ScreenShell>
  )
}
