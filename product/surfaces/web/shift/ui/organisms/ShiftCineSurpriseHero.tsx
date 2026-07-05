import { motion } from "framer-motion"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import { ShiftCineKicker } from "../atoms/ShiftCineKicker"
import { ShiftCineTitle } from "../atoms/ShiftCineTitle"

/**
 * The hero shown when the rail's trailing Surprise affordance is focused. It
 * mirrors ShiftCineHero's layout and spring so the crossfade between a game and
 * the surprise slot reads as one continuous scene, but carries a "pick something
 * at random" call-to-action instead of game copy.
 */
export function ShiftCineSurpriseHero() {
  return (
    <div
      className="shift-cine-hero-stack"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.cineSurpriseHero)}
    >
      <motion.div
        className="shift-cine-hero"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
      >
        <ShiftCineKicker>Feeling lucky?</ShiftCineKicker>
        <ShiftCineTitle>Surprise Me</ShiftCineTitle>
        <p className="shift-cine-affordance-blurb">
          Jump into something at random
        </p>
      </motion.div>
    </div>
  )
}
