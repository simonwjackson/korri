import { motion } from "framer-motion"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import { ShiftCineKicker } from "../atoms/ShiftCineKicker"
import { ShiftCineTitle } from "../atoms/ShiftCineTitle"

/**
 * The hero shown when the rail's trailing Store affordance is focused. It
 * mirrors ShiftCineLibraryHero's layout and spring so the crossfade between a
 * game and the store reads as one continuous scene, but carries a
 * find-something-new call-to-action. Everything in the store is free to
 * acquire, so the copy invites searching, never buying.
 */
export function ShiftCineStoreHero() {
  return (
    <div
      className="shift-cine-hero-stack"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.cineStoreHero)}
    >
      <motion.div
        className="shift-cine-hero"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
      >
        <ShiftCineKicker>Something new</ShiftCineKicker>
        <ShiftCineTitle>Store</ShiftCineTitle>
        <p className="shift-cine-affordance-blurb">
          Search the remote catalogs
        </p>
      </motion.div>
    </div>
  )
}
