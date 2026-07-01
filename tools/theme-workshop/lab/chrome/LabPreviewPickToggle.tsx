import { MousePointer2 } from "lucide-react"

export function LabPreviewPickToggle({
  active,
  onChange,
}: {
  readonly active: boolean
  readonly onChange: (active: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`pt-ctl-btn${active ? " is-on" : ""}`}
      aria-pressed={active}
      aria-label={active ? "Stop picking parts" : "Pick parts"}
      title="Pick parts inside the rendered app · Alt/Option-click temporarily picks · Esc returns to normal clicks"
      onClick={() => onChange(!active)}
    >
      <MousePointer2 size={14} aria-hidden />
      Pick
    </button>
  )
}
