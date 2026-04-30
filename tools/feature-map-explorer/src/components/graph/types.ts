import type { EdgeType, NodeKind } from "../../types"

/*
 * Shared types for the React Flow graph layer. The visual node and edge
 * components consume these via React Flow's `data` prop; Graph.tsx is
 * the single producer.
 */

export type GraphNodeStatus =
  | "draft"
  | "planned"
  | "active"
  | "implemented"
  | "fixme"
  | "skip"
  | "warning"
  | "error"

export type GraphNodeData = {
  kind: NodeKind
  entityId: string
  title: string
  secondary: string
  statusToken: GraphNodeStatus | null
  diagnosticCount: number
}

export type GraphEdgeData = {
  type: EdgeType
}

export const NODE_WIDTH = 220
export const NODE_HEIGHT = 64
