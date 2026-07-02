/**
 * Shift — the status-bar user avatar (atom).
 */
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

export function ShiftAvatar({ src }: { readonly src: string }) {
  return (
    <img
      className="shift-cine-avatar"
      src={src}
      alt=""
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.avatar)}
    />
  )
}
