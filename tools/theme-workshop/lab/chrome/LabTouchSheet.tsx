import { type ReactNode, useState } from "react"

export function LabTouchSheet({ panels }: { readonly panels: readonly { id: string; label: string; render: () => ReactNode }[] }) {
  const [tab, setTab] = useState(panels[0]?.id ?? "")
  const [expanded, setExpanded] = useState(true)
  const panel = panels.find(candidate => candidate.id === tab) ?? panels[0]
  return (
    <div className={`pt-sheet${expanded ? " is-expanded" : ""}`}>
      <button type="button" className="pt-sheet-grab" onClick={() => setExpanded(value => !value)} aria-label={expanded ? "Collapse panel" : "Expand panel"}>
        <span />
      </button>
      <div className="pt-sheet-tabs" role="tablist" aria-label="Panels">
        {panels.map(candidate => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={panel?.id === candidate.id}
            className={`pt-sheet-tab${panel?.id === candidate.id ? " is-on" : ""}`}
            onClick={() => {
              setTab(candidate.id)
              setExpanded(true)
            }}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <div className="pt-sheet-body">{panel?.render()}</div>
    </div>
  )
}
