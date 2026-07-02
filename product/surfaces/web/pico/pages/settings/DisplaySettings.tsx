/**
 * pico surface. ATOMIC LAYER: page. Display & video (static).
 */
import { BlockBar } from "../../ui/atoms/BlockBar"
import { Toggle } from "../../ui/atoms/Toggle"
import { Opt } from "../../ui/molecules/Opt"
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
        <SettingRow label="Brightness" state="selected">
          <BlockBar level={6} max={10} />
        </SettingRow>
        <SettingRow label="Color Mode">
          <Opt value="VIVID" />
        </SettingRow>
        <SettingRow label="Scanlines">
          <Toggle state="on" />
        </SettingRow>
        <SettingRow label="Integer Scale">
          <Toggle state="on" />
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
