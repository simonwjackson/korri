/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * The shared game-detail header: small cartridge + an info column (title, tags,
 * and whatever the screen puts below — a note paragraph and/or chips). Reused by
 * the release picker, emulator chooser, community stats, and not-installed pages.
 */
import type { ReactNode } from "react"
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Title } from "../atoms/Title"
import { GameCartUnmarked } from "./GameCartUnmarked"

export function DetailHead({
  game,
  tags,
  artTone = "default",
  children,
}: {
  readonly game: PicoGame
  readonly tags: ReactNode
  readonly artTone?: "default" | "dim"
  readonly children?: ReactNode
}) {
  return (
    <div
      className="pcDet-head"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.detailHead)}
    >
      <div className={`pc-art sm${artTone === "dim" ? " pcDet-dim" : ""}`}>
        <GameCartUnmarked game={game} />
      </div>
      <div className="pcDet-head-info">
        <Title size={1}>{game.title}</Title>
        <div className="pcDet-tags">{tags}</div>
        {children}
      </div>
    </div>
  )
}
