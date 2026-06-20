/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Stream reconnecting (static). GameOverlay backdrop + a reconnecting hero.
 */
import { PicoIcon } from "../../PicoIcon"
import { Btn } from "../../ui/atoms/Btn"
import { QualityBar } from "../../ui/molecules/QualityBar"
import { Hero } from "../../ui/organisms/Hero"
import { GameOverlay } from "../../ui/templates/GameOverlay"

export function Reconnecting() {
  return (
    <GameOverlay>
      <div className="pcIg-reconnect">
        <Hero
          glyph="⚠"
          glyphTone="info"
          title="RECONNECTING…"
          message="Lost the thread — reeling it back in…"
          spinner
        >
          <div className="pcIg-attempt">ATTEMPT 2 OF 5</div>
          <QualityBar level={2} tone="drop" tag="DROPPING" />
          <Btn kind="danger">
            <PicoIcon name="close" /> QUIT
          </Btn>
        </Hero>
      </div>
    </GameOverlay>
  )
}
