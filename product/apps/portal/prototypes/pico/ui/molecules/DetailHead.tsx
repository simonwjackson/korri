/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * The shared game-detail header: small cartridge + an info column (title, tags,
 * and whatever the screen puts below — a note paragraph and/or chips). Reused by
 * the release picker, emulator chooser, community stats, and not-installed pages.
 */
import type { ReactNode } from "react"
import type { PicoGame } from "../../fixtures"
import { Title } from "../atoms/Title"
import { GameCart } from "./GameCart"

export function DetailHead({
  game,
  tags,
  dim,
  children,
}: {
  readonly game: PicoGame
  readonly tags: ReactNode
  /** Dims the art (e.g. for a not-installed game). */
  readonly dim?: boolean
  readonly children?: ReactNode
}) {
  return (
    <div className="pcDet-head">
      <div className={`pc-art sm${dim ? " pcDet-dim" : ""}`}>
        <GameCart game={game} showFav={false} />
      </div>
      <div className="pcDet-head-info">
        <Title size={1}>{game.title}</Title>
        <div className="pcDet-tags">{tags}</div>
        {children}
      </div>
    </div>
  )
}
