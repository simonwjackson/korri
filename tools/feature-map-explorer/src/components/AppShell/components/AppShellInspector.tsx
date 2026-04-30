import { Copy, ExternalLink, PanelRight } from "lucide-react"
import type { ReactNode } from "react"
import type {
  BddNode,
  BriefNode,
  Diagnostic,
  FeatureMap,
  FeatureNode,
  GraphEdge,
  JobNode,
  ScenarioStatus,
  SelectedNode,
  Status,
} from "../../../types"
import { nodeKey, parseEdgeEndpoint } from "../../../types"
import { useAppShell } from "../AppShell.context"
import { AppShellDiagnostics } from "./AppShellDiagnostics"

/*
 * Inspector — read-only metadata view for the currently selected node.
 *
 * Branches on map status first (loading / missing / error / no
 * selection), then on selected.kind. Edits land in Unit 6 behind an
 * "Edit" affordance added here.
 */
export function AppShellInspector() {
  const { status, map, selected } = useAppShell()

  return (
    <aside className="col-start-3 row-start-2 flex min-w-0 flex-col border-border border-l bg-surface">
      <InspectorHeader />
      <div className="flex flex-1 flex-col overflow-y-auto">
        {status !== "ready" && <InspectorPlaceholder status={status} />}
        {status === "ready" && !selected && <InspectorEmpty />}
        {status === "ready" && selected && map && (
          <InspectorBody map={map} selected={selected} />
        )}
      </div>
    </aside>
  )
}

function InspectorHeader() {
  return (
    <div className="flex h-10 items-center gap-2 border-border border-b px-3 text-text-muted">
      <PanelRight size={14} aria-hidden="true" />
      <span className="text-xs uppercase tracking-wide">Inspector</span>
    </div>
  )
}

function InspectorPlaceholder({
  status,
}: {
  status: "loading" | "missing" | "error"
}) {
  const message =
    status === "loading"
      ? "Loading feature map…"
      : status === "missing"
        ? "Feature map not generated yet."
        : "Couldn't load the feature map."
  return (
    <div className="grid flex-1 place-items-center px-6 text-center">
      <p className="text-text-muted text-sm">{message}</p>
    </div>
  )
}

function InspectorEmpty() {
  return (
    <div className="grid flex-1 place-items-center px-6 text-center">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm text-text">No selection</p>
        <p className="text-text-muted text-xs">
          Pick a node in the rail to inspect it.
        </p>
      </div>
    </div>
  )
}

function InspectorBody({
  map,
  selected,
}: {
  map: FeatureMap
  selected: SelectedNode
}) {
  const node = findNode(map, selected)
  if (!node) {
    return (
      <div className="grid flex-1 place-items-center px-6 text-center">
        <p className="text-text-muted text-sm">
          Selected node was removed in the latest map.
        </p>
      </div>
    )
  }

  switch (selected.kind) {
    case "job":
      return <JobInspector node={node as JobNode} map={map} />
    case "brief":
      return <BriefInspector node={node as BriefNode} map={map} />
    case "feature":
      return <FeatureInspector node={node as FeatureNode} map={map} />
    case "bdd":
      return <BddInspector node={node as BddNode} map={map} />
  }
}

function JobInspector({ node, map }: { node: JobNode; map: FeatureMap }) {
  const incoming = edgesToward("job", node.id, map.edges)
  return (
    <InspectorLayout>
      <NodeHeader
        kindLabel="Job"
        title={node.title || node.id}
        id={node.id}
        statusToken={statusToken(node.status)}
        statusLabel={node.status}
      />
      <PathRow path={node.path} />
      <Section title="Briefs that reference this job">
        <EdgeChips
          endpoints={incoming.map(e => e.from)}
          map={map}
          emptyLabel="No briefs link to this job yet."
        />
      </Section>
      <Section title="Diagnostics">
        <AppShellDiagnostics
          diagnostics={diagnosticsForPath(map.diagnostics, node.path)}
        />
      </Section>
    </InspectorLayout>
  )
}

function BriefInspector({ node, map }: { node: BriefNode; map: FeatureMap }) {
  return (
    <InspectorLayout>
      <NodeHeader
        kindLabel="Brief"
        title={node.title || node.id}
        id={node.id}
        statusToken={statusToken(node.status)}
        statusLabel={node.status}
      />
      <PathRow path={node.path} />
      <Section title="Jobs">
        <EdgeChips
          endpoints={node.jobs.map(j => `job:${j}`)}
          map={map}
          emptyLabel="No jobs linked from frontmatter."
        />
      </Section>
      <Section title="Feature">
        {node.featureId ? (
          <EdgeChips
            endpoints={[`feature:${node.featureId}`]}
            map={map}
            emptyLabel=""
          />
        ) : (
          <p className="text-text-muted text-xs">
            Brief is not linked to a feature folder yet.
          </p>
        )}
      </Section>
      <Section title="Verified by">
        <EdgeChips
          endpoints={edgesToward("brief", node.id, map.edges).map(e => e.from)}
          map={map}
          emptyLabel="No BDD scenarios reference this brief yet."
        />
      </Section>
      <Section title="Diagnostics">
        <AppShellDiagnostics
          diagnostics={diagnosticsForPath(map.diagnostics, node.path)}
        />
      </Section>
    </InspectorLayout>
  )
}

function FeatureInspector({
  node,
  map,
}: {
  node: FeatureNode
  map: FeatureMap
}) {
  return (
    <InspectorLayout>
      <NodeHeader
        kindLabel="Feature"
        title={node.id}
        id={`${node.product}/${node.name}`}
        statusToken={node.briefId ? "active" : "warning"}
        statusLabel={node.briefId ? "linked" : "no brief"}
      />
      <PathRow path={node.path} />
      <Section title="Brief">
        {node.briefId ? (
          <EdgeChips
            endpoints={[`brief:${node.briefId}`]}
            map={map}
            emptyLabel=""
          />
        ) : (
          <p className="text-text-muted text-xs">
            No <Mono>brief.md</Mono> in this feature folder.
          </p>
        )}
      </Section>
      <Section title="Scenarios">
        <EdgeChips
          endpoints={node.bddIds.map(id => `bdd:${id}`)}
          map={map}
          emptyLabel="No <code>.feature</code> files in this folder."
        />
      </Section>
      <Section title="Diagnostics">
        <AppShellDiagnostics
          diagnostics={diagnosticsForPath(map.diagnostics, node.path)}
        />
      </Section>
    </InspectorLayout>
  )
}

function BddInspector({ node, map }: { node: BddNode; map: FeatureMap }) {
  return (
    <InspectorLayout>
      <NodeHeader
        kindLabel="Scenarios"
        title={node.name}
        id={node.id}
        statusToken={null}
        statusLabel={`${node.scenarios.length} scenarios`}
      />
      <PathRow path={node.path} />

      <Section title="Links">
        <EdgeChips
          endpoints={[
            ...(node.featureId ? [`feature:${node.featureId}`] : []),
            ...(node.briefId ? [`brief:${node.briefId}`] : []),
            ...node.jobIds.map(j => `job:${j}`),
          ]}
          map={map}
          emptyLabel="No links to feature, brief, or job."
        />
      </Section>

      <Section title="Scenarios">
        <ScenarioList scenarios={node.scenarios} />
      </Section>

      <Section title="Diagnostics">
        <AppShellDiagnostics
          diagnostics={diagnosticsForPath(map.diagnostics, node.path)}
        />
      </Section>
    </InspectorLayout>
  )
}

function InspectorLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 px-4 py-4">{children}</div>
}

function NodeHeader({
  kindLabel,
  title,
  id,
  statusToken,
  statusLabel,
}: {
  kindLabel: string
  title: string
  id: string
  statusToken: StatusToken | null
  statusLabel: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-text-muted text-xs uppercase tracking-wide">
        {kindLabel}
      </span>
      <h3 className="font-semibold text-text text-lg leading-tight">{title}</h3>
      <div className="flex items-center gap-2 text-text-muted text-xs">
        <code className="font-mono">{id}</code>
        {statusToken && <StatusDot token={statusToken} />}
        <span>{statusLabel}</span>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-text-muted text-xs uppercase tracking-wide">
        {title}
      </h4>
      {children}
    </section>
  )
}

function PathRow({ path }: { path: string }) {
  const onCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(path)
    }
  }
  return (
    <div className="flex items-center gap-1.5">
      <code className="flex-1 truncate rounded-md border border-border bg-bg px-2 py-1 font-mono text-text-muted text-xs">
        {path}
      </code>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy path"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg text-text-muted hover:bg-surface-elevated hover:text-text"
      >
        <Copy size={12} aria-hidden="true" />
      </button>
    </div>
  )
}

function EdgeChips({
  endpoints,
  map,
  emptyLabel,
}: {
  endpoints: readonly string[]
  map: FeatureMap
  emptyLabel: string
}) {
  const { setSelected } = useAppShell()
  if (endpoints.length === 0) {
    return <p className="text-text-muted text-xs">{emptyLabel}</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {endpoints.map(endpoint => {
        const ref = parseEdgeEndpoint(endpoint)
        const label = ref ? edgeChipLabel(ref, map) : endpoint
        const disabled = !ref
        return (
          <button
            key={endpoint}
            type="button"
            onClick={() => ref && setSelected(ref)}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1 font-mono text-text-muted text-xs hover:border-accent hover:text-text disabled:opacity-50"
          >
            <ExternalLink size={10} aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

function ScenarioList({
  scenarios,
}: {
  scenarios: readonly { name: string; status: ScenarioStatus }[]
}) {
  if (scenarios.length === 0) {
    return <p className="text-text-muted text-xs">No scenarios.</p>
  }
  return (
    <ul className="flex flex-col gap-1">
      {scenarios.map((scenario, idx) => (
        <li
          key={`${scenario.name}-${idx}`}
          className="flex items-center gap-2 rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
        >
          <StatusDot token={scenarioStatusToken(scenario.status)} />
          <span className="flex-1 truncate text-text">{scenario.name}</span>
          <span className="font-mono text-text-muted text-xs">
            {scenario.status}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-bg px-1 py-0.5 font-mono text-text text-xs">
      {children}
    </code>
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

function statusToken(status: Status): StatusToken {
  switch (status) {
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

function scenarioStatusToken(status: ScenarioStatus): StatusToken {
  switch (status) {
    case "active":
      return "active"
    case "fixme":
      return "fixme"
    case "skip":
      return "skip"
  }
}

function findNode(
  map: FeatureMap,
  ref: SelectedNode,
): JobNode | BriefNode | FeatureNode | BddNode | null {
  switch (ref.kind) {
    case "job":
      return map.jobs.find(n => n.id === ref.id) ?? null
    case "brief":
      return map.briefs.find(n => n.id === ref.id) ?? null
    case "feature":
      return map.features.find(n => n.id === ref.id) ?? null
    case "bdd":
      return map.bdd.find(n => n.id === ref.id) ?? null
  }
}

function edgesToward(
  kind: SelectedNode["kind"],
  id: string,
  edges: readonly GraphEdge[],
): GraphEdge[] {
  const target = `${kind}:${id}`
  return edges.filter(e => e.to === target)
}

function diagnosticsForPath(
  diagnostics: readonly Diagnostic[],
  path: string,
): Diagnostic[] {
  return diagnostics.filter(d => d.path === path)
}

function edgeChipLabel(ref: SelectedNode, map: FeatureMap): string {
  switch (ref.kind) {
    case "job": {
      const job = map.jobs.find(j => j.id === ref.id)
      return job ? `${ref.kind} · ${job.title || job.id}` : nodeKey(ref)
    }
    case "brief": {
      const brief = map.briefs.find(b => b.id === ref.id)
      return brief ? `${ref.kind} · ${brief.title || brief.id}` : nodeKey(ref)
    }
    case "feature":
      return `${ref.kind} · ${ref.id}`
    case "bdd": {
      const bdd = map.bdd.find(b => b.id === ref.id)
      return bdd ? `${ref.kind} · ${bdd.name}` : nodeKey(ref)
    }
  }
}
