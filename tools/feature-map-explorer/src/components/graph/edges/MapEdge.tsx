import {
  BaseEdge,
  type Edge,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react"
import type { EdgeType } from "../../../types"
import type { GraphEdgeData } from "../types"

/*
 * Custom edge that styles by relationship type:
 *
 *   specifies (feature → brief) — solid accent
 *   verifies  (brief   → bdd)   — solid accent-muted
 *   contains  (feature → bdd)   — dashed neutral (compositional)
 *   informs   (job     → *)     — dotted neutral (lightest, "background")
 */

type MapFlowEdge = Edge<GraphEdgeData, "map">

const STYLES: Record<
  EdgeType,
  { stroke: string; strokeWidth: number; strokeDasharray?: string }
> = {
  specifies: { stroke: "var(--color-accent)", strokeWidth: 1.5 },
  verifies: { stroke: "var(--color-accent-muted)", strokeWidth: 1.5 },
  contains: {
    stroke: "var(--color-border-strong)",
    strokeWidth: 1,
    strokeDasharray: "4 3",
  },
  informs: {
    stroke: "var(--color-text-muted)",
    strokeWidth: 1,
    strokeDasharray: "2 4",
  },
}

export function MapEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<MapFlowEdge>) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  })
  const style = STYLES[data?.type ?? "informs"]
  return <BaseEdge id={id} path={path} style={style} />
}
