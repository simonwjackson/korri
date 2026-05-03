import {
  AlertTriangle,
  Briefcase,
  FileText,
  ListTree,
  Loader2,
  Search,
  TestTube2,
} from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import type {
  BddNode,
  BriefNode,
  FeatureMap,
  FeatureNode,
  JobNode,
  NodeKind,
  ScenarioStatus,
  SelectedNode,
} from "../../../types"
import { useAppShell } from "../AppShell.context"

/*
 * Left rail — the rail-driven navigation surface that stands in for the
 * graph until Unit 5 lands React Flow. Reads the loaded map from
 * context, lets the user filter by title, and groups rows by node kind.
 */
export function AppShellLeftRail() {
  const { status, map, selected, setSelected, leftRailOpen } = useAppShell()
  const [filter, setFilter] = useState("")

  return (
    <aside
      aria-hidden={!leftRailOpen}
      className={`col-start-1 row-start-3 flex min-w-0 flex-col overflow-hidden bg-surface ${
        leftRailOpen
          ? "border-border border-r"
          : "pointer-events-none border-r-0"
      }`}
    >
      <div className="border-border border-b p-3">
        <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-bg px-2 text-text-muted focus-within:border-accent">
          <Search size={12} aria-hidden="true" />
          <input
            type="search"
            placeholder="Filter…"
            aria-label="Filter rail"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full bg-transparent text-text text-xs outline-none placeholder:text-text-muted"
          />
        </label>
      </div>

      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto p-2">
        {status === "loading" && <RailLoading />}
        {status === "missing" && (
          <RailMessage message="Map not generated yet." />
        )}
        {status === "error" && <RailMessage message="Failed to load map." />}
        {status === "ready" && map && (
          <RailGroups
            map={map}
            filter={filter}
            selected={selected}
            onSelect={setSelected}
          />
        )}
      </nav>
    </aside>
  )
}

function RailGroups({
  map,
  filter,
  selected,
  onSelect,
}: {
  map: FeatureMap
  filter: string
  selected: SelectedNode | null
  onSelect: (ref: SelectedNode | null) => void
}) {
  const normalized = filter.trim().toLowerCase()
  const matches = useMemo(() => filterMap(map, normalized), [map, normalized])

  const isSelected = (kind: NodeKind, id: string) =>
    selected?.kind === kind && selected.id === id

  return (
    <>
      <RailGroup label="Jobs" icon={<ListTree size={14} aria-hidden="true" />}>
        {matches.jobs.map(job => (
          <RailRow
            key={job.id}
            label={job.title || job.id}
            secondary={job.id}
            statusToken={statusToken(job.status)}
            selected={isSelected("job", job.id)}
            onClick={() => onSelect({ kind: "job", id: job.id })}
          />
        ))}
        {matches.jobs.length === 0 && <RailEmpty />}
      </RailGroup>

      <RailGroup
        label="Briefs"
        icon={<Briefcase size={14} aria-hidden="true" />}
      >
        {matches.briefs.map(brief => (
          <RailRow
            key={brief.id}
            label={brief.title || brief.id}
            secondary={brief.id}
            statusToken={statusToken(brief.status)}
            selected={isSelected("brief", brief.id)}
            onClick={() => onSelect({ kind: "brief", id: brief.id })}
          />
        ))}
        {matches.briefs.length === 0 && <RailEmpty />}
      </RailGroup>

      <RailGroup
        label="Features"
        icon={<FileText size={14} aria-hidden="true" />}
      >
        {matches.features.map(feature => (
          <RailRow
            key={feature.id}
            label={feature.id}
            secondary={feature.briefId ? "linked" : "no brief"}
            statusToken={feature.briefId ? "active" : "warning"}
            selected={isSelected("feature", feature.id)}
            onClick={() => onSelect({ kind: "feature", id: feature.id })}
          />
        ))}
        {matches.features.length === 0 && <RailEmpty />}
      </RailGroup>

      <RailGroup
        label="Scenarios"
        icon={<TestTube2 size={14} aria-hidden="true" />}
      >
        {matches.bdd.map(bdd => (
          <RailRow
            key={bdd.id}
            label={bdd.name}
            secondary={`${bdd.scenarios.length} scenario${
              bdd.scenarios.length === 1 ? "" : "s"
            }`}
            statusToken={bddRollupStatus(bdd)}
            selected={isSelected("bdd", bdd.id)}
            onClick={() => onSelect({ kind: "bdd", id: bdd.id })}
          />
        ))}
        {matches.bdd.length === 0 && <RailEmpty />}
      </RailGroup>

      {map.diagnostics.length > 0 && (
        <RailGroup
          label="Diagnostics"
          icon={<AlertTriangle size={14} aria-hidden="true" />}
        >
          <DiagnosticsRailList map={map} onSelect={onSelect} />
        </RailGroup>
      )}
    </>
  )
}

function RailGroup({
  label,
  icon,
  children,
}: {
  label: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-2 pt-1 text-text-muted">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex flex-col gap-px">{children}</div>
    </section>
  )
}

function RailRow({
  label,
  secondary,
  statusToken,
  selected,
  onClick,
}: {
  label: string
  secondary: string | null
  statusToken: StatusToken | null
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-surface-elevated ${
        selected
          ? "bg-surface-elevated text-text"
          : "text-text-muted hover:text-text"
      }`}
    >
      {statusToken && <StatusDot token={statusToken} />}
      <span className="flex-1 truncate">{label}</span>
      {secondary && (
        <span className="font-mono text-text-muted text-xs">{secondary}</span>
      )}
    </button>
  )
}

function RailEmpty() {
  return <span className="px-2 text-text-muted text-xs">No matches.</span>
}

function RailLoading() {
  return (
    <div className="flex items-center gap-2 px-2 py-3 text-text-muted text-xs">
      <Loader2 size={12} aria-hidden="true" className="animate-spin" />
      Loading…
    </div>
  )
}

function RailMessage({ message }: { message: string }) {
  return <p className="px-2 py-3 text-text-muted text-xs">{message}</p>
}

function DiagnosticsRailList({
  map,
  onSelect,
}: {
  map: FeatureMap
  onSelect: (ref: SelectedNode | null) => void
}) {
  return (
    <div className="flex flex-col gap-px">
      {map.diagnostics.map(diag => {
        const ref = diagnosticTarget(diag, map)
        const token: StatusToken =
          diag.severity === "error" ? "error" : "warning"
        return (
          <button
            key={`${diag.severity}-${diag.path ?? "global"}-${diag.message}`}
            type="button"
            onClick={() => onSelect(ref)}
            disabled={!ref}
            className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-text-muted text-xs hover:bg-surface-elevated hover:text-text disabled:hover:bg-transparent disabled:hover:text-text-muted"
          >
            <span className="mt-1">
              <StatusDot token={token} />
            </span>
            <span className="flex-1 truncate">{diag.message}</span>
          </button>
        )
      })}
    </div>
  )
}

type StatusToken =
  | "draft"
  | "planned"
  | "active"
  | "implemented"
  | "fixme"
  | "skip"
  | "error"
  | "warning"

// Static class strings so Tailwind v4 can detect every variant during scan.
const STATUS_BG: Record<StatusToken, string> = {
  draft: "bg-status-draft",
  planned: "bg-status-planned",
  active: "bg-status-active",
  implemented: "bg-status-implemented",
  fixme: "bg-status-fixme",
  skip: "bg-status-skip",
  error: "bg-status-error",
  warning: "bg-status-warning",
}

function StatusDot({ token }: { token: StatusToken }) {
  return (
    <span
      aria-hidden="true"
      className={`block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_BG[token]}`}
    />
  )
}

function statusToken(s: JobNode["status"] | BriefNode["status"]): StatusToken {
  switch (s) {
    case "draft":
      return "draft"
    case "planned":
      return "planned"
    case "active":
      return "active"
    case "implemented":
      return "implemented"
    case "deprecated":
      return "skip"
  }
}

function bddRollupStatus(bdd: BddNode): StatusToken | null {
  if (bdd.scenarios.length === 0) return null
  const statuses = new Set<ScenarioStatus>(bdd.scenarios.map(s => s.status))
  if (statuses.has("fixme")) return "fixme"
  if (statuses.size === 1 && statuses.has("skip")) return "skip"
  return "active"
}

function diagnosticTarget(
  diag: { path?: string },
  map: FeatureMap,
): SelectedNode | null {
  if (!diag.path) return null
  const feature = map.features.find(f => f.path === diag.path)
  if (feature) return { kind: "feature", id: feature.id }
  const bdd = map.bdd.find(b => b.path === diag.path)
  if (bdd) return { kind: "bdd", id: bdd.id }
  const brief = map.briefs.find(b => b.path === diag.path)
  if (brief) return { kind: "brief", id: brief.id }
  const job = map.jobs.find(j => j.path === diag.path)
  if (job) return { kind: "job", id: job.id }
  return null
}

function filterMap(
  map: FeatureMap,
  normalized: string,
): {
  jobs: JobNode[]
  briefs: BriefNode[]
  features: FeatureNode[]
  bdd: BddNode[]
} {
  if (normalized === "") {
    return {
      jobs: map.jobs,
      briefs: map.briefs,
      features: map.features,
      bdd: map.bdd,
    }
  }
  const test = (s: string) => s.toLowerCase().includes(normalized)
  return {
    jobs: map.jobs.filter(j => test(j.id) || test(j.title)),
    briefs: map.briefs.filter(b => test(b.id) || test(b.title)),
    features: map.features.filter(f => test(f.id) || test(f.name)),
    bdd: map.bdd.filter(
      b => test(b.id) || test(b.name) || b.scenarios.some(s => test(s.name)),
    ),
  }
}
