/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Controller pairing (static).
 */
import { Glyph, Spinner } from "../../screens/kit"
import { Icon } from "../../ui/atoms/Icon"
import { Title } from "../../ui/atoms/Title"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Pairing() {
  return (
    <ScreenShell
      title="PICO ▸ PAIR"
      hints={[{ key: "b", label: "CANCEL" }]}
      className="center"
    >
      <div className="pcMd-pair">
        <Glyph tone="accent">
          <Icon name="plus" />
        </Glyph>
        <Title size={1}>PAIR A CONTROLLER</Title>
        <div className="pcMd-code">8-4-2-7</div>
        <div className="pcMd-pair-wait">
          <Spinner />
          <span className="pc-sub">listening for a new pad…</span>
        </div>
        <p className="pc-hero-msg">hold SELECT + START to say hello</p>
      </div>
    </ScreenShell>
  )
}
