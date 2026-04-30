import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  type NodeMouseHandler,
  ReactFlow,
} from "@xyflow/react"
import { useCallback, useMemo } from "react"
import { layoutGraph } from "../../layout/dagreLayout"
import type {
  BddNode as BddRecord,
  BriefNode as BriefRecord,
  Diagnostic,
  FeatureMap,
  FeatureNode as FeatureRecord,
  JobNode as JobRecord,
  NodeKind,
  SelectedNode,
} from "../../types"
import { useAppShell } from "../AppShell/AppShell.context"
import { MapEdge } from "./edges/MapEdge"
import { BddNode } from "./nodes/BddNode"
import { BriefNode } from "./nodes/BriefNode"
import { FeatureNode } from "./nodes/FeatureNode"
import { JobNode } from "./nodes/JobNode"
import {
  type GraphEdgeData,
  type GraphNodeData,
  type GraphNodeStatus,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./types"

/*
 * Top-level graph compound. Reads the loaded map from AppShell context,
 * projects each node into a React Flow node, runs dagre for positions,
 * and bridges click → selection back into context. No animations — all
 * pan/zoom transitions respect prefers-reduced-motion via app.css.
 */

const NODE_TYPES = {
  job: JobNode,
  brief: BriefNode,
  feature: FeatureNode,
  bdd: BddNode,
}

const EDGE_TYPES = {
  map: MapEdge,
}

export function Graph({ map }: { map: FeatureMap }) {
  const { selected, setSelected } = useAppShell()

  const { nodes, edges } = useMemo(
    () => buildFlow(map, selected),
    [map, selected],
  )

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      const data = node.data as GraphNodeData
      setSelected({ kind: data.kind, id: data.entityId })
    },
    [setSelected],
  )

  const onPaneClick = useCallback(() => {
    setSelected(null)
  }, [setSelected])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      panOnScroll
      zoomOnDoubleClick={false}
      minZoom={0.4}
      maxZoom={1.6}
      className="bg-bg"
    >
      <Background gap={24} size={1} color="var(--color-border)" />
      <Controls
        showInteractive={false}
        className="!border !border-border !bg-surface !shadow-none"
      />
    </ReactFlow>
  )
}

function buildFlow(
  map: FeatureMap,
  selected: SelectedNode | null,
): { nodes: Node<GraphNodeData>[]; edges: Edge<GraphEdgeData>[] } {
  const diagnosticsByPath = groupDiagnosticsByPath(map.diagnostics)

  const layoutNodes = [
    ...map.jobs.map(j =>
      mapNode("job", j.id, jobNodeData(j, diagnosticsByPath)),
    ),
    ...map.briefs.map(b =>
      mapNode("brief", b.id, briefNodeData(b, diagnosticsByPath)),
    ),
    ...map.features.map(f =>
      mapNode("feature", f.id, featureNodeData(f, diagnosticsByPath)),
    ),
    ...map.bdd.map(b =>
      mapNode("bdd", b.id, bddNodeData(b, diagnosticsByPath)),
    ),
  ]

  const layoutEdges = map.edges.map((e, idx) => ({
    id: `${e.from}->${e.to}#${idx}`,
    source: e.from,
    target: e.to,
    data: { type: e.type } as GraphEdgeData,
  }))

  const result = layoutGraph(
    layoutNodes.map(n => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: n.data,
    })),
    layoutEdges,
    { rankdir: "LR" },
  )

  const flowNodes: Node<GraphNodeData>[] = result.nodes.map(node => ({
    id: node.id,
    type: node.data?.kind ?? "feature",
    position: { x: node.x, y: node.y },
    data: node.data as GraphNodeData,
    selected: isSelected(node.id, selected),
    draggable: false,
    selectable: true,
  }))

  const flowEdges: Edge<GraphEdgeData>[] = result.edges.map(edge => ({
    id: edge.id ?? `${edge.source}->${edge.target}`,
    source: edge.source,
    target: edge.target,
    type: "map",
    data: edge.data as GraphEdgeData,
    focusable: false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      color: "var(--color-text-muted)",
    },
  }))

  return { nodes: flowNodes, edges: flowEdges }
}

function mapNode(
  kind: NodeKind,
  id: string,
  data: GraphNodeData,
): { id: string; data: GraphNodeData } {
  return {
    id: `${kind}:${id}`,
    data,
  }
}

function jobNodeData(
  job: JobRecord,
  diagnostics: Map<string, Diagnostic[]>,
): GraphNodeData {
  return {
    kind: "job",
    entityId: job.id,
    title: job.title || job.id,
    secondary: job.id,
    statusToken: statusForRecord(job.status),
    diagnosticCount: diagnostics.get(job.path)?.length ?? 0,
  }
}

function briefNodeData(
  brief: BriefRecord,
  diagnostics: Map<string, Diagnostic[]>,
): GraphNodeData {
  return {
    kind: "brief",
    entityId: brief.id,
    title: brief.title || brief.id,
    secondary: brief.id,
    statusToken: statusForRecord(brief.status),
    diagnosticCount: diagnostics.get(brief.path)?.length ?? 0,
  }
}

function featureNodeData(
  feature: FeatureRecord,
  diagnostics: Map<string, Diagnostic[]>,
): GraphNodeData {
  return {
    kind: "feature",
    entityId: feature.id,
    title: feature.id,
    secondary: feature.briefId ? "linked" : "no brief",
    statusToken: feature.briefId ? "active" : "warning",
    diagnosticCount: diagnostics.get(feature.path)?.length ?? 0,
  }
}

function bddNodeData(
  bdd: BddRecord,
  diagnostics: Map<string, Diagnostic[]>,
): GraphNodeData {
  const fixme = bdd.scenarios.some(s => s.status === "fixme")
  const allSkip =
    bdd.scenarios.length > 0 && bdd.scenarios.every(s => s.status === "skip")
  const token: GraphNodeStatus = fixme ? "fixme" : allSkip ? "skip" : "active"
  return {
    kind: "bdd",
    entityId: bdd.id,
    title: bdd.name,
    secondary: `${bdd.scenarios.length} scenario${
      bdd.scenarios.length === 1 ? "" : "s"
    }`,
    statusToken: bdd.scenarios.length === 0 ? null : token,
    diagnosticCount: diagnostics.get(bdd.path)?.length ?? 0,
  }
}

function statusForRecord(
  status: JobRecord["status"] | BriefRecord["status"],
): GraphNodeStatus {
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

function isSelected(flowId: string, selected: SelectedNode | null): boolean {
  if (!selected) return false
  return flowId === `${selected.kind}:${selected.id}`
}

function groupDiagnosticsByPath(
  diagnostics: readonly Diagnostic[],
): Map<string, Diagnostic[]> {
  const out = new Map<string, Diagnostic[]>()
  for (const diag of diagnostics) {
    if (!diag.path) continue
    const list = out.get(diag.path)
    if (list) list.push(diag)
    else out.set(diag.path, [diag])
  }
  return out
}
