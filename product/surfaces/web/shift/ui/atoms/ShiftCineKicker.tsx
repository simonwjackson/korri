import type { ReactNode } from "react"
import type { LaunchStatusTone } from "../../launch-failure-copy"

/** The small overline above the hero title ("Ready to play", "Couldn't start").
 * `tone` mirrors the launch lifecycle so the colour reflects state; omit it for
 * the neutral browsing kicker. */
export function ShiftCineKicker({
  tone,
  children,
}: {
  readonly tone?: LaunchStatusTone
  readonly children: ReactNode
}) {
  return (
    <span className="shift-cine-kicker" data-tone={tone}>
      {children}
    </span>
  )
}
