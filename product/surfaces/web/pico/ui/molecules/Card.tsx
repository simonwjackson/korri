/**
 * pico surface. ATOMIC LAYER: molecule.
 *
 * A bordered panel card. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Card({
  title,
  children,
  className,
}: {
  readonly title?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <div
      className={`pc-card ${className ?? ""}`}
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.card)}
    >
      {title !== undefined ? (
        <div
          className="pc-card-title"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCardTitle)}
        >
          {title}
        </div>
      ) : null}
      {children}
    </div>
  )
}
