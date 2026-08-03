/** One button-hint in the cinematic legend: a glyph badge (A/B/X/Y) plus its
 * action label. `primary` highlights the focused/affirmative action. */
export function ShiftCineHint({
  glyph,
  label,
  primary,
}: {
  readonly glyph: string
  readonly label: string
  readonly primary?: boolean
}) {
  return (
    <span className="shift-cine-hint" data-primary={primary || undefined}>
      <span className="shift-cine-hint-glyph" aria-hidden>
        {glyph}
      </span>
      <span>{label}</span>
    </span>
  )
}
