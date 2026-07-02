/**
 * pico surface. ATOMIC LAYER: atom.
 *
 * Determinate progress bar (0..100). Width is the only inline style (layout,
 * not type), which is allowed. Moved from `kit.tsx`.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
export function Progress({ pct }: { readonly pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div
      className="pc-progress"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.progress)}
    >
      <div className="pc-progress-fill" style={{ width: `${clamped}%` }} />
    </div>
  )
}
