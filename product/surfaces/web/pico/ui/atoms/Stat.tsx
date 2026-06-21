/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * A labelled stat readout. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"

export function Stat({
  label,
  value,
}: {
  readonly label: ReactNode
  readonly value: ReactNode
}) {
  return (
    <span className="pc-stat">
      <b>{value}</b>
      {label}
    </span>
  )
}
