import { type ReactNode, useState } from "react"
import { useLab } from "../Lab.context"
import { LabFloatingPanel } from "./LabFloatingPanel"

const ACCENTS: Record<string, string> = {
  parts: "#7dd3fc",
  sources: "#f0abfc",
  states: "#86efac",
  inspector: "#c4b5fd",
  devices: "#fcd34d",
}

export function LabFocusRail({
  panels,
}: {
  readonly panels: readonly { id: string; label: string; render: () => ReactNode }[]
}) {
  const { adapter, surfacePath } = useLab()
  const [open, setOpen] = useState<string | null>(null)
  const active = panels.find(panel => panel.id === open)
  const x = typeof window === "undefined" ? 1100 : window.innerWidth - 288
  return (
    <>
      {active ? (
        <LabFloatingPanel title={active.label} initial={{ x: open === "inspector" || open === "devices" ? x : 24, y: 96 }} width={250} accent={ACCENTS[active.id] ?? "#7dd3fc"}>
          {active.render()}
        </LabFloatingPanel>
      ) : null}
      <nav className="pt-command" aria-label="Focus commands">
        {panels.map(panel => (
          <button key={panel.id} type="button" className={open === panel.id ? "is-on" : ""} onClick={() => setOpen(value => (value === panel.id ? null : panel.id))}>
            {panel.label}
          </button>
        ))}
        <span className="pt-command-sep" />
        <code>{adapter.id} · {surfacePath}</code>
      </nav>
    </>
  )
}
