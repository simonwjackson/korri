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
      <div
        className="pcFut-feat-top"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeatTop)}
      >
        <div
          className="pc-art pcFut-feat-art"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcArt)}
        >
          <GameCartUnmarked game={hero} />
        </div>
        <div
          className="pcFut-feat-info"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeatInfo)}
        >
          <div
            className="pc-sub"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.sub)}
          >
            GAME OF THE DAY
          </div>
          <Title size={2}>{hero.title}</Title>
          <div
            className="pcFut-feat-tags"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeatTags)}
          >
            {hero.genre.toUpperCase()} · {hero.developer.toUpperCase()}
          </div>
          <p
            className="pcFut-feat-blurb"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeatBlurb)}
          >
            Today's pick, hand-dusted just for you. Tight controls, sneaky
            shortcuts, and a soundtrack that lives rent-free in your skull.
          </p>
          <div
            className="pcFut-feat-why"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeatWhy)}
          >
            <Badge tone="accent">WHY?</Badge>
            <span
              className="pc-dim"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
            >
              3 friends played it this week · trending in PORTMASTER
            </span>
          </div>
          <div
            className="pcFut-feat-actions"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeatActions)}
          >
            <Btn kind="primary" state="selected">
              <Icon name="play" /> PLAY
            </Btn>
            <Btn>
              <Icon name="plus" /> WISHLIST
            </Btn>
          </div>
        </div>
      </div>
      <div
        className="pcFut-feat-more"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeatMore)}
      >
        <div
          className="pcFut-group-h"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutGroupH)}
        >
          MORE LIKE THIS
        </div>
        <div
          className="pcFut-feat-rail"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeatRail)}
        >
          {more.map(game => (
            <div
              key={game.id}
              className="pc-art sm pcFut-feat-thumb"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcArt)}
            >
              <GameCartUnmarked game={game} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
