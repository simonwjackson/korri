/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * A bordered panel card. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"

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
    <div className={`pc-card ${className ?? ""}`}>
      {title !== undefined ? (
        <div className="pc-card-title">{title}</div>
      ) : null}
      {children}
    </div>
  )
}
