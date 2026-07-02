/**
 * pico surface. ATOMIC LAYER: atom.
 *
 * Animated 8-bit spinner (three blinking blocks). Moved from `kit.tsx`.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
export function Spinner() {
  return (
    <span
      className="pc-spinner"
      aria-hidden="true"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.spinner)}
    >
      <b />
      <b />
      <b />
    </span>
  )
}
