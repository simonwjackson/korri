/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Screenshot gallery: one big focused shot + a caption, over a strip of
 * thumbnails with the current one selected. (Carts stand in for shots in the
 * prototype.)
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Title } from "../atoms/Title"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function ScreenshotGallery({
  game,
  shots,
}: {
  readonly game: PicoGame
  readonly shots: readonly PicoGame[]
}) {
  return (
    <div
      className="pcDet-gallery"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.screenshotGallery)}
    >
      <div
        className="pcDet-shot"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDetShot)}
      >
        <div
          className="pcDet-shot-art"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDetShotArt)}
        >
          <GameCartUnmarked game={game} />
        </div>
        <div
          className="pcDet-shot-cap"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDetShotCap)}
        >
          <Title size={-1}>{game.title}</Title>
          <span
            className="pc-dim"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
          >
            SCREENSHOT 2 / 5 · WORLD 1-1
          </span>
        </div>
      </div>
      <div
        className="pcDet-strip"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDetStrip)}
      >
        {shots.slice(0, 5).map((shot, index) => (
          <div
            key={shot.id}
            className={`pc-art sm pcDet-thumb ${index === 1 ? "sel" : ""}`}
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcArt)}
          >
            <GameCartUnmarked game={shot} />
          </div>
        ))}
      </div>
    </div>
  )
}
