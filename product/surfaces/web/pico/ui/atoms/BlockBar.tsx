/**
 * pico surface. ATOMIC LAYER: atom.
 *
 * Chunky block slider (▓░ run) like Variant B. Moved from `kit.tsx`.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
export function BlockBar({
  level,
  max,
}: {
  readonly level: number
  readonly max: number
}) {
  return (
    <span
      className="pc-bar"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.blockBar)}
    >
      <span className="pc-bar-on">{"█".repeat(Math.max(0, level))}</span>
      <span className="pc-bar-off">{"░".repeat(Math.max(0, max - level))}</span>
    </span>
  )
}
