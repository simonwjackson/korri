/**
 * pico surface. ATOMIC LAYER: page. Crash (static).
 */
import { Btn } from "../../ui/atoms/Btn"
import { Icon } from "../../ui/atoms/Icon"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Crash() {
  return (
    <ScreenShell
      title="PICO ▸ SESSION"
      tone="alert"
      hints={[
        { key: "a", label: "RETRY" },
        { key: "b", label: "BACK" },
      ]}
      className="center"
    >
      <Hero
        glyph={<Icon name="close" />}
        glyphTone="bad"
        title="GAME CRASHED"
        message="Well, that went sideways — the game bailed out during teardown. Your saves are safe and sound, though."
      >
        <div className="pcSes-stage">
          <span className="pcSes-stage-k">STAGE</span>
          <span className="pcSes-stage-v">exit</span>
          <span className="pcSes-stage-k">CODE</span>
          <span className="pcSes-stage-v">139</span>
        </div>
        <Btn kind="primary">
          <Icon name="restart" /> RETRY
        </Btn>
        <Btn>BACK</Btn>
      </Hero>
    </ScreenShell>
  )
}
