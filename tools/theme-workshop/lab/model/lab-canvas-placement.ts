/**
 * Pure Compose-board placement math. Where a freshly placed part lands is a
 * user-selectable pattern (Cascade / Spiral / Grid) so the board never just
 * marches off one axis to infinity. All functions here are pure: the board
 * supplies the world anchor (the viewport center in world space), the already
 * occupied rects, and a nominal card size, and gets back a top-left point.
 */

export const LAB_PLACEMENT_PATTERNS = ["cascade", "spiral", "grid"] as const

export type LabPlacementPattern = (typeof LAB_PLACEMENT_PATTERNS)[number]

export const DEFAULT_PLACEMENT_PATTERN: LabPlacementPattern = "cascade"

export function isPlacementPattern(
  value: string,
): value is LabPlacementPattern {
  return (LAB_PLACEMENT_PATTERNS as readonly string[]).includes(value)
}

export type Point = { readonly x: number; readonly y: number }
export type Size = { readonly w: number; readonly h: number }
export type Rect = Point & Size

/** Nominal card cell used for spacing/overlap. Mirrors the board's grid spacing
 * so device-framed cards don't collide before the user drags them. */
export const PLACEMENT_CELL: Size = { w: 540, h: 480 }
const GRID_COLUMNS = 3
const GAP = 32
const CASCADE_STEP = 56
const MAX_SLOTS = 512

export function rectsOverlap(a: Rect, b: Rect, gap = GAP): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  )
}

function isFree(point: Point, size: Size, occupied: readonly Rect[]): boolean {
  const rect = { ...point, ...size }
  return !occupied.some(other => rectsOverlap(rect, other))
}

/** Top-left so the card is centered on the anchor world point. */
function centeredOn(anchor: Point, size: Size): Point {
  return { x: anchor.x - size.w / 2, y: anchor.y - size.h / 2 }
}

/** Integer grid offsets in outward square-spiral order: (0,0), then ring 1, … */
function spiralOffsets(count: number): readonly Point[] {
  const offsets: Point[] = [{ x: 0, y: 0 }]
  let x = 0
  let y = 0
  let leg = 1
  // Walk right, down, left, up with growing leg lengths (classic spiral).
  const dirs = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ] as const
  let dir = 0
  while (offsets.length < count) {
    for (let pass = 0; pass < 2 && offsets.length < count; pass += 1) {
      const step = dirs[dir % 4] ?? dirs[0]
      for (let i = 0; i < leg && offsets.length < count; i += 1) {
        x += step.x
        y += step.y
        offsets.push({ x, y })
      }
      dir += 1
    }
    leg += 1
  }
  return offsets
}

function placeCascade(
  occupied: readonly Rect[],
  anchor: Point,
  size: Size,
): Point {
  const start = centeredOn(anchor, size)
  for (let i = 0; i < MAX_SLOTS; i += 1) {
    const point = {
      x: start.x + i * CASCADE_STEP,
      y: start.y + i * CASCADE_STEP,
    }
    if (isFree(point, size, occupied)) return point
  }
  return start
}

function placeSpiral(
  occupied: readonly Rect[],
  anchor: Point,
  size: Size,
): Point {
  const stepX = size.w + GAP
  const stepY = size.h + GAP
  for (const offset of spiralOffsets(MAX_SLOTS)) {
    const center = {
      x: anchor.x + offset.x * stepX,
      y: anchor.y + offset.y * stepY,
    }
    const point = centeredOn(center, size)
    if (isFree(point, size, occupied)) return point
  }
  return centeredOn(anchor, size)
}

function gridSlot(origin: Point, size: Size, index: number): Point {
  const col = index % GRID_COLUMNS
  const row = Math.floor(index / GRID_COLUMNS)
  return {
    x: origin.x + col * (size.w + GAP),
    y: origin.y + row * (size.h + GAP),
  }
}

function placeGrid(
  occupied: readonly Rect[],
  origin: Point,
  size: Size,
): Point {
  for (let i = 0; i < MAX_SLOTS; i += 1) {
    const point = gridSlot(origin, size, i)
    if (isFree(point, size, occupied)) return point
  }
  return origin
}

/** Where the next placed card's top-left should sit, avoiding `occupied`. */
export function placeNext(
  pattern: LabPlacementPattern,
  occupied: readonly Rect[],
  anchor: Point,
  size: Size = PLACEMENT_CELL,
): Point {
  switch (pattern) {
    case "spiral":
      return placeSpiral(occupied, anchor, size)
    case "grid":
      return placeGrid(occupied, anchor, size)
    default:
      return placeCascade(occupied, anchor, size)
  }
}

/** Deterministic full layout of `count` cards for the Tidy command, using the
 * active pattern's slot order (ignores current positions). */
export function repackPositions(
  pattern: LabPlacementPattern,
  count: number,
  anchor: Point,
  size: Size = PLACEMENT_CELL,
): readonly Point[] {
  if (count <= 0) return []
  if (pattern === "grid") {
    return Array.from({ length: count }, (_, i) => gridSlot(anchor, size, i))
  }
  if (pattern === "spiral") {
    const stepX = size.w + GAP
    const stepY = size.h + GAP
    return spiralOffsets(count).map(offset =>
      centeredOn(
        { x: anchor.x + offset.x * stepX, y: anchor.y + offset.y * stepY },
        size,
      ),
    )
  }
  // Cascade repack must not overlap: step each card down the diagonal until it
  // clears the ones already placed (mirrors placeCascade for new cards).
  const placed: Rect[] = []
  const out: Point[] = []
  for (let i = 0; i < count; i += 1) {
    const point = placeCascade(placed, anchor, size)
    out.push(point)
    placed.push({ ...point, w: size.w, h: size.h })
  }
  return out
}
