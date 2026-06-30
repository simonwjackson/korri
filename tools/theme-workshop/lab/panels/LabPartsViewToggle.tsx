import { LayoutGrid, List, type LucideIcon } from "lucide-react"
import type { LabPartsView } from "./lab-parts-view"

const OPTIONS: readonly {
  readonly id: LabPartsView
  readonly Icon: LucideIcon
  readonly label: string
}[] = [
  { id: "visual", Icon: LayoutGrid, label: "Visual" },
  { id: "list", Icon: List, label: "List" },
]

/** Compact titlebar control to switch the Parts panel between visual and list. */
export function LabPartsViewToggle({
  mode,
  onChange,
}: {
  readonly mode: LabPartsView
  readonly onChange: (mode: LabPartsView) => void
}) {
  return (
    <div className="pt-titlebar-toggle" role="tablist" aria-label="Parts view">
      {OPTIONS.map(option => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={mode === option.id}
          aria-label={option.label}
          className={`pt-titlebar-btn${mode === option.id ? " is-on" : ""}`}
          onClick={() => onChange(option.id)}
        >
          <option.Icon size={14} aria-hidden />
        </button>
      ))}
    </div>
  )
}
