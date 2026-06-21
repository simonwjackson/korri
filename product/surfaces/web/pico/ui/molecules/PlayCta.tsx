/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * The "play / continue" call-to-action: play glyph + label. Visual only. Lifted
 * from the repeated `pcShow-play` / `pcLast-cta` spans; the caller supplies the
 * screen-specific class so styling stays per-surface for now.
 */
import type { ReactNode } from "react"
import { Icon } from "../atoms/Icon"

export function PlayCta({
  label,
  className,
}: {
  readonly label: ReactNode
  readonly className?: string
}) {
  return (
    <span className={className}>
      <Icon name="play" /> {label}
    </span>
  )
}
