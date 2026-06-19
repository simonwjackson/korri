/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Battery low (static).
 */
import { Badge, Btn, Hero } from "../../screens/kit"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function BatteryLow() {
  return (
    <ScreenShell
      tone="alert"
      hints={[{ key: "a", label: "DISMISS" }]}
      className="center"
    >
      <Hero
        glyph="▮"
        glyphTone="bad"
        title="BATTERY LOW"
        message="8% remaining. Plug in soon — your current session will auto-save before shutdown."
      >
        <Badge tone="bad">8%</Badge>
        <Btn>ENABLE BATTERY SAVER</Btn>
      </Hero>
    </ScreenShell>
  )
}
