import dagre from "dagre"

/*
 * Pure layout helper for the feature-map graph.
 *
 * Wraps dagre's `graphlib.Graph` so callers don't have to construct it
 * by hand and so the conversion from dagre's centre coordinates to
 * React Flow's top-left coordinates lives in one tested place.
 *
 * Stays generic over node/edge `data` so tests can exercise it with
 * trivial fixtures and Graph.tsx can pass FeatureMap-shaped payloads.
 */

export type LayoutNodeInput<TData = unknown> = {
  id: string
  width: number
  height: number
  data?: TData
}

export type LayoutEdgeInput<TData = unknown> = {
  id?: string
  source: string
  target: string
  data?: TData
}

export type PositionedNode<TData = unknown> = LayoutNodeInput<TData> & {
  x: number
  y: number
}

export type LayoutOptions = {
  rankdir?: "TB" | "BT" | "LR" | "RL"
  nodesep?: number
  ranksep?: number
  marginx?: number
  marginy?: number
}

export type LayoutResult<TNode = unknown, TEdge = unknown> = {
  nodes: PositionedNode<TNode>[]
  edges: LayoutEdgeInput<TEdge>[]
  bounds: { width: number; height: number }
}

export function layoutGraph<TNode = unknown, TEdge = unknown>(
  nodes: readonly LayoutNodeInput<TNode>[],
  edges: readonly LayoutEdgeInput<TEdge>[],
  options: LayoutOptions = {},
): LayoutResult<TNode, TEdge> {
  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [...edges],
      bounds: { width: 0, height: 0 },
    }
  }

  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({
    rankdir: options.rankdir ?? "LR",
    nodesep: options.nodesep ?? 28,
    ranksep: options.ranksep ?? 96,
    marginx: options.marginx ?? 24,
    marginy: options.marginy ?? 24,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    g.setNode(node.id, { width: node.width, height: node.height })
  }

  for (const edge of edges) {
    // Skip edges whose endpoints aren't in the node list — keeps the
    // helper resilient to partial input.
    if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue
    g.setEdge(
      edge.source,
      edge.target,
      {},
      edge.id ?? `${edge.source}->${edge.target}`,
    )
  }

  dagre.layout(g)

  let maxX = 0
  let maxY = 0
  const positioned: PositionedNode<TNode>[] = nodes.map(node => {
    const meta = g.node(node.id)
    const x = meta ? meta.x - node.width / 2 : 0
    const y = meta ? meta.y - node.height / 2 : 0
    maxX = Math.max(maxX, x + node.width)
    maxY = Math.max(maxY, y + node.height)
    return { ...node, x, y }
  })

  return {
    nodes: positioned,
    edges: [...edges],
    bounds: { width: maxX, height: maxY },
  }
}
