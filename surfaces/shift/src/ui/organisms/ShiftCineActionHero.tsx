import { motion } from "framer-motion"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import { ShiftCineKicker } from "../atoms/ShiftCineKicker"
import { ShiftCineTitle } from "../atoms/ShiftCineTitle"

/**
 * The hero shown when a trailing rail action is focused. It mirrors
 * ShiftCineHero's layout and spring so moving between a game and an action
 * reads as one continuous scene, and carries the action's own copy instead of
 * game metadata.
 */
export function ShiftCineActionHero({
  label,
  description,
  kicker = "Set up",
}: {
  readonly label: string
  readonly description?: string
  readonly kicker?: string
}) {
  return (
    <div
      className="shift-cine-hero-stack"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.cineLibraryHero, label)}
    >
      <motion.div
        className="shift-cine-hero"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
      >
        <ShiftCineKicker>{kicker}</ShiftCineKicker>
        <ShiftCineTitle>{label}</ShiftCineTitle>
        {description ? (
          <p className="shift-cine-affordance-blurb">{description}</p>
        ) : null}
      </motion.div>
    </div>
  )
}
