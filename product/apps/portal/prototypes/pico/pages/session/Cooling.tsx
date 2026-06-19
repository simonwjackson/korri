/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Cooling down (static).
 */
import { Hero } from "../../screens/kit"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Cooling() {
  return (
    <ScreenShell
      title="PICO ▸ SESSION"
      hints={[{ key: "a", label: "DISMISS" }]}
      className="center"
    >
      <Hero
        glyph="❄"
        glyphTone="info"
        title="COOLING DOWN"
        message="The host is catching its breath before the next launch — keeps your streams nice and steady."
      >
        <div className="pcSes-countdown">READY IN 0:08</div>
      </Hero>
    </ScreenShell>
  )
}
