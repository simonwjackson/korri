/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * A selectable list container. Pass rows; mark the selected one. Moved from
 * `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function List({
  children,
  partAttrs,
}: {
  readonly children: ReactNode
  /** Override the `list` tag so a composing organism claims this root. */
  readonly partAttrs?: Record<string, string>
}) {
  return (
    <div
      className="pc-list"
      {...(partAttrs ?? picoDesignPartAttrs(PICO_DESIGN_PARTS.list))}
    >
      {children}
    </div>
  )
}
