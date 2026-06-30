/**
 * Pure geometry for floating-panel docking: which panels are touching (and thus
 * form one connected group), the bounding box of a group, and the magnetic
 * "snap to a neighbour" alignment that makes panels click together into clean,
 * gapless stacks and rows.
 *
 * Kept free of React/DOM so it can be unit-tested in isolation.
 */

export type Rect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Tolerance (px) within which two edges count as "touching". */
const JOIN = 4
/** Minimum shared extent along the shared edge for an adjacency to count. */
const OVERLAP_MIN = 12

function overlap1D(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0)
}

/**
 * True when the two rects sit flush in a vertical stack (one directly above the
 * other, with horizontal overlap). Side-by-side adjacency is intentionally not
 * recognised: panels only stack top-to-bottom.
 */
export function areAdjacent(a: Rect, b: Rect, join = JOIN): boolean {
  const ay2 = a.y + a.height
  const by2 = b.y + b.height
  const xOverlap = overlap1D(a.x, a.x + a.width, b.x, b.x + b.width)
  return (
    (Math.abs(ay2 - b.y) <= join || Math.abs(by2 - a.y) <= join) &&
    xOverlap >= OVERLAP_MIN
  )
}

/**
 * Partition ids into connected groups: any two panels that touch (directly or
 * through a chain of touching panels) end up in the same group. Order of ids is
 * preserved within each group.
 */
export function computeGroups(
  ids: readonly string[],
  rects: Record<string, Rect>,
): string[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root) ?? root
    let cursor = x
    while (cursor !== root) {
      const next = parent.get(cursor) ?? root
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b))
  }
  for (const id of ids) if (rects[id]) parent.set(id, id)
  const present = ids.filter(id => rects[id])
  for (let i = 0; i < present.length; i++)
    for (let j = i + 1; j < present.length; j++) {
      const a = present[i]
      const b = present[j]
      if (a && b && areAdjacent(rects[a] as Rect, rects[b] as Rect)) union(a, b)
    }
  const groups = new Map<string, string[]>()
  for (const id of present) {
    const root = find(id)
    const list = groups.get(root)
    if (list) list.push(id)
    else groups.set(root, [id])
  }
  return [...groups.values()]
}

/** Smallest rect containing every member rect. */
export function unionBBox(rects: readonly Rect[]): Rect {
  const first = rects[0]
  if (!first) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = first.x
  let minY = first.y
  let maxX = first.x + first.width
  let maxY = first.y + first.height
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function allPairsOverlap(
  rects: readonly Rect[],
  pick: (r: Rect) => readonly [number, number],
): boolean {
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = pick(rects[i] as Rect)
      const b = pick(rects[j] as Rect)
      if (overlap1D(a[0], a[1], b[0], b[1]) <= 0) return false
    }
  return true
}

/**
 * Re-stack a connected group after one member was resized, keeping every member
 * flush so the cluster stays one cohesive unit. Vertical stacks share the
 * resized panel's x + width and re-flow top-to-bottom; horizontal rows share its
 * y + height and re-flow left-to-right. Returns null for ambiguous 2-D clusters
 * (caller should then resize the single panel only).
 */
export function reflowStack(
  baseRects: Record<string, Rect>,
  ids: readonly string[],
  resizedId: string,
  resized: Rect,
): Record<string, Rect> | null {
  const present = ids.filter(id => baseRects[id])
  if (present.length < 2) return null
  // Detect the stacking axis from the flush pre-resize layout, so the in-flight
  // resize (which may momentarily overlap a neighbour) doesn't confuse it.
  const baseList = present.map(id => baseRects[id] as Rect)
  const verticalStack =
    allPairsOverlap(baseList, r => [r.x, r.x + r.width]) &&
    !allPairsOverlap(baseList, r => [r.y, r.y + r.height])
  const horizontalRow =
    allPairsOverlap(baseList, r => [r.y, r.y + r.height]) &&
    !allPairsOverlap(baseList, r => [r.x, r.x + r.width])
  const out: Record<string, Rect> = {}
  if (verticalStack) {
    const ordered = present
      .slice()
      .sort((a, b) => (baseRects[a] as Rect).y - (baseRects[b] as Rect).y)
    let cursor = Math.min(...present.map(id => (baseRects[id] as Rect).y))
    for (const id of ordered) {
      const height =
        id === resizedId ? resized.height : (baseRects[id] as Rect).height
      out[id] = { x: resized.x, y: cursor, width: resized.width, height }
      cursor += height
    }
    return out
  }
  if (horizontalRow) {
    const ordered = present
      .slice()
      .sort((a, b) => (baseRects[a] as Rect).x - (baseRects[b] as Rect).x)
    let cursor = Math.min(...present.map(id => (baseRects[id] as Rect).x))
    for (const id of ordered) {
      const width =
        id === resizedId ? resized.width : (baseRects[id] as Rect).width
      out[id] = { x: cursor, y: resized.y, width, height: resized.height }
      cursor += width
    }
    return out
  }
  return null
}

/**
 * Align a moving rect to the nearest neighbour edge so it clicks flush into a
 * stack or row. When it abuts a neighbour vertically it inherits that
 * neighbour's x + width (clean column); horizontally it inherits y + height
 * (clean row). Returns the rect unchanged when nothing is within `snap`.
 */
export function snapToNeighbors(
  rect: Rect,
  neighbors: readonly Rect[],
  snap = 8,
): Rect {
  let best: { rect: Rect; dist: number } | null = null
  const consider = (candidate: Rect, dist: number) => {
    if (dist <= snap && (!best || dist < best.dist))
      best = { rect: candidate, dist }
  }
  const rx2 = rect.x + rect.width
  const ry2 = rect.y + rect.height
  for (const n of neighbors) {
    const ny2 = n.y + n.height
    const xOverlap = overlap1D(rect.x, rx2, n.x, n.x + n.width)
    // Vertical stacking only: place the rect directly below or above a
    // horizontally-overlapping neighbour. No side-by-side snapping.
    if (xOverlap >= OVERLAP_MIN) {
      consider(
        { x: n.x, y: ny2, width: n.width, height: rect.height },
        Math.abs(rect.y - ny2),
      )
      consider(
        { x: n.x, y: n.y - rect.height, width: n.width, height: rect.height },
        Math.abs(ry2 - n.y),
      )
    }
  }
  return best ? (best as { rect: Rect }).rect : rect
}
