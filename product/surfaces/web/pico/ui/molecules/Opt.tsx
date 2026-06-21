/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * Option cycler ◂ VALUE ▸. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PicoIcon } from "../../PicoIcon"

export function Opt({ value }: { readonly value: ReactNode }) {
  return (
    <span className="pc-opt">
      <PicoIcon name="back" className="pc-opt-arr" />
      {value}
      <PicoIcon name="play" className="pc-opt-arr" />
    </span>
  )
}
