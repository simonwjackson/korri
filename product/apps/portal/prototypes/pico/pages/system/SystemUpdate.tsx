/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. System update (static).
 */
import { Btn, Hero, Progress } from "../../screens/kit"
import { Icon } from "../../ui/atoms/Icon"
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
      <div className="pcSys-upd-bar">
        <Progress pct={62} />
        <div className="pc-dim">DOWNLOADING · 154 / 248 MB</div>
      </div>
    </ScreenShell>
  )
}
