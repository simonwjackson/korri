// Atom — a status pip. Color carries semantics only (nominal/caution/critical
// /active/idle); never decorative.

export function VigieStatusDot({
  status,
  label,
}: {
  readonly status: string
  readonly label?: string
}) {
  return (
    <span className="vigie-dot-row">
      <span className="vigie-dot" data-status={status} aria-hidden="true" />
      {label ? <span className="vigie-dot-label">{label}</span> : null}
    </span>
  )
}
