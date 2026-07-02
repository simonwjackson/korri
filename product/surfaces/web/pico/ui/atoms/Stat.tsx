/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * A labelled stat readout. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Stat({
  label,
  value,
}: {
  readonly label: ReactNode
  readonly value: ReactNode
}) {
  return (
    <span className="pc-stat" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.stat)}>
      <b>{value}</b>
      {label}
    </span>
  )
}
