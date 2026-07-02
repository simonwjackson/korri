/**
 * pico surface. ATOMIC LAYER: page. Unknown status (static).
 */
import { Badge } from "../../ui/atoms/Badge"
import { Btn } from "../../ui/atoms/Btn"
import { Icon } from "../../ui/atoms/Icon"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function UnknownStatus() {
  return (
    <ScreenShell
      title="PICO ▸ LAUNCH"
      hints={[
        { key: "a", label: "LAUNCH" },
        { key: "b", label: "BACK" },
      ]}
      className="center"
    >
      <Hero
        glyph="?"
        glyphTone="info"
        title="STATUS UNKNOWN"
        message="Couldn't reach the host to check if the coast is clear — but nothing's stopping you. Launch at your own peril."
      >
        <Badge tone="info">UNKNOWN</Badge>
        <Btn kind="primary">
          <Icon name="play" /> LAUNCH ANYWAY
        </Btn>
      </Hero>
    </ScreenShell>
  )
}
