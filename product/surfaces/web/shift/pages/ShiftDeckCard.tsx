/**
 * Shift library — the Deck's riffled card (molecule).
 *
 * The single cover that fills the frame and springs in/out as you riffle the
 * stack. A horizontal throw riffles next/prev; an upward throw plays. The page
 * owns which game is current; the card owns the throw gesture and mapping it to
 * intent.
 */
import { AnimatePresence, motion } from "framer-motion"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftCoverArt } from "./ShiftCoverArt"
import type { ShiftLibraryGame } from "./shift-library-game"

const SPRING = { type: "spring", stiffness: 320, damping: 30 } as const

export interface ShiftDeckCardProps {
  readonly game: ShiftLibraryGame
  readonly onRiffle: (step: "next" | "prev") => void
  readonly onPlay: () => void
}

export function ShiftDeckCard({ game, onRiffle, onPlay }: ShiftDeckCardProps) {
  return (
    <div
      className="shift-lib-deck-stage"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.deckCard)}
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          key={game.id}
          className="shift-lib-deck-card"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={(_event, info) => {
            if (info.offset.x < -80) onRiffle("next")
            else if (info.offset.x > 80) onRiffle("prev")
            else if (info.offset.y < -80) onPlay()
          }}
          initial={{ opacity: 0, scale: 0.9, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -24 }}
          transition={SPRING}
        >
          <ShiftCoverArt src={game.artUrl} draggable={false} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
