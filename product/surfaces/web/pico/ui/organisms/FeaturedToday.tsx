/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Game of the day: a big featured cart with blurb + actions, and a "more like
 * this" thumbnail rail.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Badge } from "../atoms/Badge"
import { Btn } from "../atoms/Btn"
import { Icon } from "../atoms/Icon"
import { Title } from "../atoms/Title"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function FeaturedToday({
  hero,
  more,
}: {
  readonly hero: PicoGame
  readonly more: readonly PicoGame[]
}) {
  return (
    <div
      className="pcFut-feat"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.featuredToday)}
    >
      <div className="pcFut-feat-top">
        <div className="pc-art pcFut-feat-art">
          <GameCartUnmarked game={hero} />
        </div>
        <div className="pcFut-feat-info">
          <div className="pc-sub">GAME OF THE DAY</div>
          <Title size={2}>{hero.title}</Title>
          <div className="pcFut-feat-tags">
            {hero.genre.toUpperCase()} · {hero.developer.toUpperCase()}
          </div>
          <p className="pcFut-feat-blurb">
            Today's pick, hand-dusted just for you. Tight controls, sneaky
            shortcuts, and a soundtrack that lives rent-free in your skull.
          </p>
          <div className="pcFut-feat-why">
            <Badge tone="accent">WHY?</Badge>
            <span className="pc-dim">
              3 friends played it this week · trending in PORTMASTER
            </span>
          </div>
          <div className="pcFut-feat-actions">
            <Btn kind="primary" state="selected">
              <Icon name="play" /> PLAY
            </Btn>
            <Btn>
              <Icon name="plus" /> WISHLIST
            </Btn>
          </div>
        </div>
      </div>
      <div className="pcFut-feat-more">
        <div className="pcFut-group-h">MORE LIKE THIS</div>
        <div className="pcFut-feat-rail">
          {more.map(game => (
            <div key={game.id} className="pc-art sm pcFut-feat-thumb">
              <GameCartUnmarked game={game} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
