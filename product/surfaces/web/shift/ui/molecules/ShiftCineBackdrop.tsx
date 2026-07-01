import { AnimatePresence, motion } from "framer-motion"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

/** The full-bleed art environment behind the cinematic home: the focused game's
 * wide art crossfades on change (keyed by `artUrl`) and a scrim keeps foreground
 * copy legible. `cooled` desaturates/dims the art when a launch has failed. */
export function ShiftCineBackdrop({
  artUrl,
  cooled,
}: {
  readonly artUrl: string
  readonly cooled?: boolean
}) {
  return (
    <>
      <AnimatePresence>
        <motion.div
          key={artUrl}
          className="shift-cine-bg"
          data-cooled={cooled || undefined}
          {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.backdrop)}
          style={{ backgroundImage: `url(${artUrl})` }}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </AnimatePresence>
      <div className="shift-cine-scrim" />
    </>
  )
}
