/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Dual-screen primary surface: a companion-connected tag, a cart rail, and the
 * focused game with launch-on-TV / launch-here actions.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Btn } from "../atoms/Btn"
import { Icon } from "../atoms/Icon"
import { Title } from "../atoms/Title"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function DualPrimaryStage({ hero }: { readonly hero: PicoGame }) {
  return (
    <>
      <div
        className="pcMd-companion-tag"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dualPrimaryStage)}
      >
        <span
          className="pcMd-dot"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdDot)}
        />
        COMPANION CONNECTED · 65" 4K TV
      </div>
      <div
        className="pcMd-primary"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdPrimary)}
      >
        <div
          className="pcMd-rail"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdRail)}
        >
          <div
            className="pc-art sm"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcArt)}
          >
            <GameCartUnmarked game={hero} />
          </div>
          <div
            className="pc-art sm pcMd-rail-side"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcArt)}
          >
            <GameCartUnmarked game={hero} />
          </div>
          <div
            className="pc-art sm pcMd-rail-side"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcArt)}
          >
            <GameCartUnmarked game={hero} />
          </div>
        </div>
        <div
          className="pcMd-primary-info"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdPrimaryInfo)}
        >
          <Title size={1}>{hero.title}</Title>
          <div
            className="pc-sub"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.sub)}
          >
            {hero.developer}
          </div>
          <div
            className="pcMd-launch-row"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdLaunchRow)}
          >
            <Btn kind="primary">
              <Icon name="play" /> LAUNCH ON TV
            </Btn>
            <Btn>HERE</Btn>
          </div>
        </div>
      </div>
    </>
  )
}
