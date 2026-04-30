import { PanelRight } from "lucide-react"

/*
 * Inspector placeholder. Unit 4 wires the read-only metadata view; Unit 6
 * adds the editor pane.
 */
export function AppShellInspector() {
  return (
    <aside className="col-start-3 row-start-2 flex min-w-0 flex-col border-border border-l bg-surface">
      <div className="flex h-10 items-center gap-2 border-border border-b px-3 text-text-muted">
        <PanelRight size={14} aria-hidden="true" />
        <span className="text-xs uppercase tracking-wide">Inspector</span>
      </div>

      <div className="grid flex-1 place-items-center px-6 text-center">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-sm text-text">No selection</p>
          <p className="text-text-muted text-xs">
            Pick a node in the rail or graph to inspect it.
          </p>
        </div>
      </div>
    </aside>
  )
}
