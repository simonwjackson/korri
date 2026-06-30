/**
 * Pure side-dock geometry for the float panel deck. A panel is "docked" when it
 * sits inset against a viewport edge inside a padded well. Docked state is
 * derived from coordinates, so any viewport-width change must re-anchor docked
 * panels to the new edge — otherwise they read as floating (undocked). Docked
 * panels are stacked top-aligned at their own content height, never taller than
 * the content they hold.
 */

export const WELL_PAD = 12
export const WELL_GAP = 10
/** A panel narrower than this margin from full width is treated as "not docked". */
const FULL_WIDTH_SLACK = 4
/** Tolerance (px) for matching a panel's edge to the well anchor. */
const EDGE_EPS = 1

export type DockSide = "left" | "right"

export type DockRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height?: number
}

/** The x a docked panel's left edge must sit at for the given side/viewport. */
export function dockedX(
  side: DockSide,
  width: number,
  innerWidth: number,
): number {
  return side === "left" ? WELL_PAD : innerWidth - WELL_PAD - width
}

/** Which side well a rect is docked in at the given viewport width, or null. */
export function dockedSide(
  rect: DockRect,
  innerWidth: number,
): DockSide | null {
  if (rect.width >= innerWidth - FULL_WIDTH_SLACK) return null
  if (Math.abs(rect.x - WELL_PAD) < EDGE_EPS) return "left"
  if (Math.abs(rect.x + rect.width - (innerWidth - WELL_PAD)) < EDGE_EPS)
    return "right"
  return null
}

/**
 * Lay the given panels out as a top-aligned, gapped vertical stack inside a
 * side well, anchored to the current viewport edge. The rects carry NO explicit
 * height, so each panel sizes to its own content (never taller than content);
 * the supplied content heights are used only to space the stack.
 */
export function layoutWell(
  pos: Record<string, DockRect>,
  ids: readonly string[],
  side: DockSide,
  innerWidth: number,
  barH: number,
  contentHeight: (id: string) => number,
): Record<string, DockRect> {
  if (ids.length === 0) return pos
  const next = { ...pos }
  let cursor = barH + WELL_PAD
  for (const id of ids) {
    const rect = pos[id]
    if (!rect) continue
    next[id] = {
      x: dockedX(side, rect.width, innerWidth),
      y: cursor,
      width: rect.width,
    }
    cursor += contentHeight(id) + WELL_GAP
  }
  return next
}

/** Ids docked to a side at the given width, ordered top-to-bottom. */
export function dockedIds(
  pos: Record<string, DockRect>,
  order: readonly string[],
  side: DockSide,
  innerWidth: number,
): readonly string[] {
  return order
    .filter(id => {
      const rect = pos[id]
      return !!rect && dockedSide(rect, innerWidth) === side
    })
    .sort((a, b) => (pos[a]?.y ?? 0) - (pos[b]?.y ?? 0))
}

/**
 * On a viewport resize, keep docked panels docked: detect what was docked under
 * the previous width, then re-anchor each side's well to the new viewport edge
 * and re-stack at content height. Non-docked panels are returned untouched.
 */
export function reanchorOnResize(
  pos: Record<string, DockRect>,
  order: readonly string[],
  prevInnerWidth: number,
  innerWidth: number,
  barH: number,
  contentHeight: (id: string) => number,
): Record<string, DockRect> {
  let next = pos
  for (const side of ["left", "right"] as const) {
    const ids = dockedIds(pos, order, side, prevInnerWidth)
    if (ids.length > 0)
      next = layoutWell(next, ids, side, innerWidth, barH, contentHeight)
  }
  return next
}
