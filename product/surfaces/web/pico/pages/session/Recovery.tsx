/**
 * pico surface. ATOMIC LAYER: page. Recovery (static).
 */
import { Badge } from "../../ui/atoms/Badge"
import { Icon } from "../../ui/atoms/Icon"
import { Spinner } from "../../ui/atoms/Spinner"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Recovery() {
  return (
    <ScreenShell
      title="PICO ▸ SESSION"
      hints={[{ key: "b", label: "CANCEL" }]}
      className="center"
    >
      <Hero
        glyph={<Icon name="restart" />}
        glyphTone="accent"
        title="RECOVERING SESSION"
        message="Tidying up after a rough exit — the last session crashed, so we're putting things back in order before another go."
        adornment={<Spinner />}
      >
        <Badge tone="bad">FAILED → RECOVERING</Badge>
      </Hero>
    </ScreenShell>
  )
}
