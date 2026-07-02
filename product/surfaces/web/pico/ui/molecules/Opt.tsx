/**
 * pico surface. ATOMIC LAYER: molecule.
 *
 * Option cycler ◂ VALUE ▸. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PicoIcon } from "../../PicoIcon"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Opt({ value }: { readonly value: ReactNode }) {
  return (
    <span className="pc-opt" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.opt)}>
      <PicoIcon name="back" className="pc-opt-arr" />
      {value}
      <PicoIcon name="play" className="pc-opt-arr" />
    </span>
  )
}
