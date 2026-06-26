/**
 * A stand-in for a secondary screen's surface. A multi-screen device (e.g.
 * Thor's lower panel) renders this until a real surface is assigned to the
 * screen. It exists to prove the "any surface per screen" slot is independent
 * from the primary screen — a future quick-controls / music / guide surface
 * mounts here.
 */
export function LabScreenPlaceholder({ label }: { readonly label: string }) {
  return (
    <div className="lab-screen-placeholder">
      <span className="lab-screen-placeholder-tag">{label}</span>
      <span className="lab-screen-placeholder-hint">
        a second surface mounts here
      </span>
    </div>
  )
}
