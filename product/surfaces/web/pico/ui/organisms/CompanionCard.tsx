/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
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
      <div className="pcMd-companion-art">
        <div className="pc-art">
          <GameCartUnmarked game={hero} />
        </div>
      </div>
      <div className="pcMd-companion-overlay">
        <Title size={3}>{hero.title}</Title>
        <div className="pcMd-companion-dev">{hero.developer}</div>
      </div>
    </div>
  )
}
