import { motion } from "framer-motion"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import { ShiftCineKicker } from "../atoms/ShiftCineKicker"
import { ShiftCineTitle } from "../atoms/ShiftCineTitle"

/**
 * The hero shown when the rail's trailing Library affordance is focused. It
 * mirrors ShiftCineHero's layout and spring so the crossfade between a game and
 * the library reads as one continuous scene, but carries a collection call-to-
 * action instead of game copy.
 */
export function ShiftCineLibraryHero() {
  return (
    <div
      className="shift-cine-hero-stack"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.cineLibraryHero)}
    >
      <motion.div
        className="shift-cine-hero"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
      >
        <ShiftCineKicker>Your collection</ShiftCineKicker>
        <ShiftCineTitle>Library</ShiftCineTitle>
        <p className="shift-cine-library-blurb">Browse every game</p>
      </motion.div>
    </div>
  )
}
