/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The launch ritual: a cartridge dropping into a tube + a CRT power-on strip
 * naming the game. Presentation for the launch screen.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function LaunchTube({ game }: { readonly game: PicoGame | undefined }) {
  return (
    <div
      className="pcPer-ritual"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.launchTube)}
    >
      <div
        className="pcPer-tube"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerTube)}
      >
        <div
          className="pcPer-slot"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerSlot)}
        />
        {game ? (
          <div
            className="pcPer-cart"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerCart)}
          >
            <GameCartUnmarked game={game} />
          </div>
        ) : null}
        <div
          className="pcPer-power"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerPower)}
        >
          <div
            className="pcPer-power-line"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerPowerLine)}
          />
          <div
            className="pcPer-power-game"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerPowerGame)}
          >
            <div
              className="pcPer-power-title"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerPowerTitle)}
            >
              NOW PLAYING
            </div>
            <div
              className="pcPer-power-name"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerPowerName)}
            >
              {game?.title ?? "GAME"}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
