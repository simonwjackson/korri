import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  Briefcase,
  FileText,
  ListTree,
  Search,
  TestTube2,
} from "lucide-react"

type RailGroup = {
  label: string
  icon: LucideIcon
  count: number | null
}

/*
 * Static rail content for Unit 2. Counts are placeholders; Unit 4 wires
 * them to the loaded feature map.
 */
const RAIL_GROUPS: readonly RailGroup[] = [
  { label: "Jobs", icon: ListTree, count: null },
  { label: "Briefs", icon: Briefcase, count: null },
  { label: "Features", icon: FileText, count: null },
  { label: "Scenarios", icon: TestTube2, count: null },
  { label: "Diagnostics", icon: AlertTriangle, count: null },
]

export function AppShellLeftRail() {
  return (
    <aside className="col-start-1 row-start-2 flex min-w-0 flex-col border-border border-r bg-surface">
      <div className="border-border border-b p-3">
        <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-bg px-2 text-text-muted focus-within:border-accent">
          <Search size={12} aria-hidden="true" />
          <input
            type="search"
            placeholder="Filter…"
            aria-label="Filter rail"
            className="w-full bg-transparent text-text text-xs outline-none placeholder:text-text-muted"
          />
        </label>
      </div>

      <nav className="flex flex-1 flex-col gap-px overflow-y-auto p-2">
        {RAIL_GROUPS.map(group => (
          <RailGroupRow key={group.label} group={group} />
        ))}
      </nav>
    </aside>
  )
}

function RailGroupRow({ group }: { group: RailGroup }) {
  const Icon = group.icon
  return (
    <button
      type="button"
      disabled
      className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-text-muted hover:bg-surface-elevated hover:text-text disabled:hover:bg-transparent disabled:hover:text-text-muted"
    >
      <Icon size={14} aria-hidden="true" />
      <span className="flex-1 truncate">{group.label}</span>
      <span className="font-mono text-xs">{group.count ?? "—"}</span>
    </button>
  )
}
