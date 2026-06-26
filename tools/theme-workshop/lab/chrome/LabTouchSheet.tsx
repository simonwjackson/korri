import { type ReactNode, useState } from "react"

export function LabTouchSheet({ panels }: { readonly panels: readonly { id: string; label: string; render: () => ReactNode }[] }) {
  const [tab, setTab] = useState(panels[0]?.id ?? "")
  const panel = panels.find(candidate => candidate.id === tab) ?? panels[0]
  return (
    <section className="lab-touch-sheet" aria-label="Lab panels">
      <div className="lab-touch-tabs" role="tablist">
        {panels.map(candidate => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={panel?.id === candidate.id}
            className={panel?.id === candidate.id ? "is-on" : ""}
            onClick={() => setTab(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <div className="lab-touch-body">{panel?.render()}</div>
    </section>
  )
}
