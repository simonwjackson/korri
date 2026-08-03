import type { ReactNode } from "react"

/** A glanceable metadata pill in the cinematic home (genre, developer, a launch
 * failure reason, or a favourite marker). `tone` selects the semantic accent. */
export type ShiftCineChipTone = "favorite" | "reason"

export function ShiftCineChip({
  tone,
  children,
}: {
  readonly tone?: ShiftCineChipTone
  readonly children: ReactNode
}) {
  const modifier =
    tone === "favorite" ? " is-fav" : tone === "reason" ? " is-reason" : ""
  return <span className={`shift-cine-chip${modifier}`}>{children}</span>
}
