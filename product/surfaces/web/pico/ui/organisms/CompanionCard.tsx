/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Dual-screen companion surface: full-bleed art with the game title overlaid.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Title } from "../atoms/Title"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function CompanionCard({ hero }: { readonly hero: PicoGame }) {
  return (
    <div
      className="pcMd-companion"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.companionCard)}
    >
      <div
        className="pcMd-companion-art"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdCompanionArt)}
      >
        <div
          className="pc-art"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcArt)}
        >
          <GameCartUnmarked game={hero} />
        </div>
      </div>
      <div
        className="pcMd-companion-overlay"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdCompanionOverlay)}
      >
        <Title size={3}>{hero.title}</Title>
        <div
          className="pcMd-companion-dev"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdCompanionDev)}
        >
          {hero.developer}
        </div>
      </div>
    </div>
  )
}
