import type { LabPresentation } from "./lab-presentation"

const OPTIONS: readonly {
  readonly id: LabPresentation
  readonly label: string
}[] = [
  { id: "workspace", label: "Workspace" },
  { id: "overlay", label: "Overlay" },
]

/**
 * Switches the chrome between its two positions. The same panels and controls
 * reflow; only where they sit changes. Defaults follow the viewport until the
 * user picks here.
 */
export function LabPresentationToggle({
  presentation,
  onChange,
}: {
  readonly presentation: LabPresentation
  readonly onChange: (presentation: LabPresentation) => void
}) {
  return (
    <div className="pt-seg pt-seg-sm" role="tablist" aria-label="Layout">
      {OPTIONS.map(option => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={presentation === option.id}
          className={`pt-seg-btn${presentation === option.id ? " is-on" : ""}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
