/**
 * Shift library — one Reel cover (molecule).
 *
 * A cover on the spin wheel: enlarged and focusable at the centre, shrunk and
 * faded as it sits further out. Position/scale/opacity are driven by its signed
 * offset from the centre; activating the centre selects, activating a neighbour
 * spins it toward the middle.
 */
import { motion } from "framer-motion"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftCoverArt } from "./ShiftCoverArt"
import type { ShiftLibraryGame } from "./shift-library-game"

const SPRING = { type: "spring", stiffness: 220, damping: 26 } as const

export interface ShiftReelCoverProps {
  readonly game: ShiftLibraryGame
  readonly offset: number
  readonly isCenter: boolean
  readonly onActivate: () => void
}

export function ShiftReelCover({
  game,
  offset,
  isCenter,
  onActivate,
}: ShiftReelCoverProps) {
  return (
    <motion.button
      type="button"
      className="shift-lib-reel-cover"
      data-center={isCenter || undefined}
      aria-label={game.title}
      aria-hidden={!isCenter}
      tabIndex={isCenter ? 0 : -1}
      onClick={onActivate}
      animate={{
        x: `${offset * 64}%`,
        scale: isCenter ? 1.1 : 0.78,
        opacity: isCenter ? 1 : 0.45 - Math.abs(offset) * 0.08,
        zIndex: 10 - Math.abs(offset),
      }}
      transition={SPRING}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.reelCover, game.id)}
    >
      <ShiftCoverArt src={game.artUrl} loading="lazy" draggable={false} />
    </motion.button>
  )
}
