/**
 * pico surface. ATOMIC LAYER: page.
 * Couldn't connect (static).
 */
import { PicoIcon } from "../../PicoIcon"
import { Btn } from "../../ui/atoms/Btn"
import { Glyph } from "../../ui/atoms/Glyph"
import { Title } from "../../ui/atoms/Title"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function JoinFailed() {
  return (
    <ScreenShell
      title="PICO ▸ JOIN"
      hints={[
        { key: "a", label: "RETRY" },
        { key: "b", label: "BACK" },
      ]}
      tone="alert"
      className="center"
    >
      <div className="pcMp-failed">
        <Glyph tone="bad">
          <PicoIcon name="close" />
        </Glyph>
        <Title size={1}>COULDN’T CONNECT</Title>
        <p className="pc-hero-msg">
          PIXELPETE’s session didn’t answer. They may have started, or the
          network dropped.
        </p>
        <div className="pcMp-failed-actions">
          <Btn kind="primary">
            <PicoIcon name="restart" /> RETRY
          </Btn>
          <Btn>PLAY SOLO</Btn>
        </div>
      </div>
    </ScreenShell>
  )
}
