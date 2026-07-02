/**
 * pico surface. ATOMIC LAYER: page. Network & streaming (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
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
      <div
        className="pcSet-list"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetList)}
      >
        <SettingRow label="Wi-Fi" state="selected">
          <Toggle state="on" />
        </SettingRow>
        <SettingRow label="Network">
          <span
            className="pcSet-info"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetInfo)}
          >
            PICO-NET
          </span>
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
