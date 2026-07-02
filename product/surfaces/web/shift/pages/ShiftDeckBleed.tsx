/**
 * Shift library — the Deck's full-bleed backdrop (molecule).
 *
 * The blurred bleed of the current cover behind the card, plus its darkening
 * scrim — the "games as the whole screen" backdrop. Cross-fades as the deck
 * advances.
 */
import { AnimatePresence, motion } from "framer-motion"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftDeckBleedProps {
  readonly artUrl: string
  /** Stable key so the bleed cross-fades when the game changes. */
  readonly gameId: string
}

export function ShiftDeckBleed({ artUrl, gameId }: ShiftDeckBleedProps) {
  // The bleed and scrim are absolute-positioned direct children of the deck's
  // flex column, so they must stay SIBLINGS (no wrapper) or an in-flow wrapper
  // adds a stray flex gap. The design-part tag rides the bleed node itself.
  return (
    <>
      <AnimatePresence>
        <motion.div
          key={`bleed:${gameId}`}
          className="shift-lib-deck-bleed"
          style={{ backgroundImage: `url(${artUrl})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.deckBleed)}
        />
      </AnimatePresence>
      <div className="shift-lib-deck-scrim" />
    </>
  )
}
