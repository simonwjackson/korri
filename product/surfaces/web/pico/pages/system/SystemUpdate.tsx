/**
 * pico surface. ATOMIC LAYER: page. System update (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Btn } from "../../ui/atoms/Btn"
import { Icon } from "../../ui/atoms/Icon"
import { Progress } from "../../ui/atoms/Progress"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function SystemUpdate() {
  return (
    <ScreenShell
      title="PICO ▸ UPDATE"
      hints={[
        { key: "a", label: "INSTALL" },
        { key: "b", label: "LATER" },
      ]}
      className="center"
    >
      <Hero
        glyph={<Icon name="download" />}
        glyphTone="info"
        title="UPDATE READY"
        message="System update v2.5.0 is ready to install. 248 MB · ~3 min. The device will restart once."
      >
        <Btn kind="primary">
          <Icon name="play" /> INSTALL NOW
        </Btn>
        <Btn>RELEASE NOTES</Btn>
      </Hero>
      <div
        className="pcSys-upd-bar"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysUpdBar)}
      >
        <Progress pct={62} />
        <div className="pc-dim" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}>
          DOWNLOADING · 154 / 248 MB
        </div>
      </div>
    </ScreenShell>
  )
}
