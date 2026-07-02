/**
 * pico surface. ATOMIC LAYER: page.
 * Stream reconnecting (static). GameOverlay backdrop + a reconnecting hero.
 */
import { PicoIcon } from "../../PicoIcon"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Btn } from "../../ui/atoms/Btn"
import { Spinner } from "../../ui/atoms/Spinner"
import { QualityBar } from "../../ui/molecules/QualityBar"
import { Hero } from "../../ui/organisms/Hero"
import { GameOverlay } from "../../ui/templates/GameOverlay"

export function Reconnecting() {
  return (
    <GameOverlay>
      <div
        className="pcIg-reconnect"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcIgReconnect)}
      >
        <Hero
          glyph="⚠"
          glyphTone="info"
          title="RECONNECTING…"
          message="Lost the thread — reeling it back in…"
          adornment={<Spinner />}
        >
          <div
            className="pcIg-attempt"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcIgAttempt)}
          >
            ATTEMPT 2 OF 5
          </div>
          <QualityBar level={2} tone="drop" tag="DROPPING" />
          <Btn kind="danger">
            <PicoIcon name="close" /> QUIT
          </Btn>
        </Hero>
      </div>
    </GameOverlay>
  )
}
