/*
 * Mirror of the shapes emitted by
 * tools/generators/feature-map/generate-feature-map.ts.
 *
 * Drift contract: this file MUST be kept in sync with the generator.
 * When the generator's output changes, update these types. A future
 * iteration may codegen them directly from the generator.
 */

export type Status =
  | "draft"
  | "planned"
  | "active"
  | "implemented"
  | "deprecated"

export type DiagnosticSeverity = "error" | "warning"

export type ScenarioStatus = "active" | "fixme" | "skip"

export type NodeKind = "job" | "brief" | "feature" | "bdd"

export type EdgeType = "informs" | "specifies" | "verifies" | "contains"

export type JobNode = {
  id: string
  title: string
  status: Status
  path: string
}

export type BriefNode = {
  id: string
  title: string
  status: Status
  path: string
  featureId: string | null
  jobs: string[]
}

export type FeatureNode = {
  id: string
  product: string
  name: string
  path: string
  briefId: string | null
  bddIds: string[]
}

export type Scenario = {
  name: string
  tags: string[]
  status: ScenarioStatus
}

export type BddNode = {
  id: string
  name: string
  path: string
  featureId: string | null
  briefId: string | null
  jobIds: string[]
  scenarios: Scenario[]
}

/**
 * Edge endpoints are encoded as `kind:id` strings in the generator
 * (e.g. `feature:app/resume`, `brief:resume`). Helper below parses them.
 */
export type GraphEdge = {
  from: string
  to: string
  type: EdgeType
}

export type Diagnostic = {
  severity: DiagnosticSeverity
  message: string
  path?: string
}

export type FeatureMap = {
  generatedAt: string
  jobs: JobNode[]
  briefs: BriefNode[]
  features: FeatureNode[]
  bdd: BddNode[]
  edges: GraphEdge[]
  diagnostics: Diagnostic[]
}

export type SelectedNode = { kind: NodeKind; id: string }

export function nodeKey(ref: SelectedNode): string {
  return `${ref.kind}:${ref.id}`
}

export function parseEdgeEndpoint(endpoint: string): SelectedNode | null {
  const colon = endpoint.indexOf(":")
  if (colon === -1) return null
  const kind = endpoint.slice(0, colon) as NodeKind
  const id = endpoint.slice(colon + 1)
  if (
    kind !== "job" &&
    kind !== "brief" &&
    kind !== "feature" &&
    kind !== "bdd"
  ) {
    return null
  }
  return { kind, id }
}
