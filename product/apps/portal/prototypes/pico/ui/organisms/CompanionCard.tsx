/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Dual-screen companion surface: full-bleed art with the game title overlaid.
 */
import type { PicoGame } from "../../fixtures"
import { Title } from "../atoms/Title"
import { GameCart } from "../molecules/GameCart"

export function CompanionCard({ hero }: { readonly hero: PicoGame }) {
  return (
    <div className="pcMd-companion">
      <div className="pcMd-companion-art">
        <div className="pc-art">
          <GameCart game={hero} showFav={false} />
        </div>
      </div>
      <div className="pcMd-companion-overlay">
        <Title size={3}>{hero.title}</Title>
        <div className="pcMd-companion-dev">{hero.developer}</div>
      </div>
    </div>
  )
}
