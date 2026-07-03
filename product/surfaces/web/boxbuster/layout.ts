/**
 * boxbuster — deterministic store geometry as a pure function of library size.
 *
 * The store is sized to the number of games so it never reads as a 95%-empty
 * hall: more games → longer aisles, then more aisles, then a bigger room. Same
 * inputs always produce the same store (no randomness — see the charter's
 * "stable spatial layout" test). The viewing room is intentionally NOT scaled:
 * the store grows forward from a FIXED back wall, so the console/TV/furniture
 * behind it never move.
 *
 * `density` is the target fill fraction (filled slots / total slots). A lower
 * density yields a bigger, sparser store for the same library; a higher one a
 * smaller, fuller store. The remaining slots stay empty — "rented", on theme.
 */

export interface StoreLayout {
  /** target fill fraction the geometry was sized for */
  density: number
  /** gondola centre x positions (one per aisle) */
  aisleXs: number[]
  /** gondola half-length along z */
  halfLen: number
  /** shelf-row heights */
  levels: number[]
  /** gondola centre z */
  gondCenterZ: number
  /** store back wall z (fixed; the viewing room lives behind it) */
  backWallZ: number
  /** store front wall z (scales with the library) */
  frontWallZ: number
  /** store room centre z */
  centerZ: number
  /** store room footprint */
  room: { w: number; d: number; h: number }
  /** where the camera spawns (just inside the entrance) */
  camStartZ: number
}

const SPACING = 0.46 // centre-to-centre tape spacing along a shelf
const SIDES = 2 // each slot faces both aisles
const AISLE_DX = 7 // x gap between gondola centres
const ALL_LEVELS = [0.55, 1.25, 1.95, 2.65]
const BACK_WALL_Z = -22 // matches the original back wall; viewing room stays put behind it
const REAR_MARGIN = 3.0 // clearance between the gondolas' far end and the back wall (doorway)
const FRONT_MARGIN = 7.0 // walking space between the gondolas and the entrance
const EDGE = 4.5 // side margin from the outer aisle to the side wall
const MIN_HALFLEN = 1.2 // never stubbier than this (small libraries get short aisles)
const MAX_HALFLEN = 7.0 // longest a single aisle grows before we add another
const COMFY_AISLE_SLOTS = 16 // slots-per-row a comfortably-stocked aisle holds
const MAX_AISLES = 5
const ROOM_H = 4.2

/** The three feels the user is comparing. */
export const DENSITY = {
  cozy: 0.6,
  livedIn: 0.45,
  atmospheric: 0.3,
} as const

/** Tiny libraries also use fewer shelf rows, so they read as small, not bare. */
export function levelsFor(n: number): number[] {
  return n < 16
    ? ALL_LEVELS.slice(0, 2)
    : n < 40
      ? ALL_LEVELS.slice(0, 3)
      : ALL_LEVELS
}

export function computeLayout(gameCount: number, density: number): StoreLayout {
  const n = Math.max(1, gameCount)
  const levels = levelsFor(n)
  const perRowFactor = levels.length * SIDES

  // total slots wanted to hit the target density
  const need = Math.ceil(n / density)
  // aisle count grows with the slots needed, so a denser store is smaller (fewer
  // aisles) and a sparser one spreads wider — then derive each aisle's length
  const aisles = Math.max(
    1,
    Math.min(MAX_AISLES, Math.round(need / (perRowFactor * COMFY_AISLE_SLOTS))),
  )
  const minSlots = Math.round((MIN_HALFLEN * 2) / SPACING)
  const maxSlots = Math.round((MAX_HALFLEN * 2) / SPACING)
  const slotsPerRow = Math.max(
    minSlots,
    Math.min(maxSlots, Math.ceil(need / (aisles * perRowFactor))),
  )
  const halfLen = (slotsPerRow * SPACING) / 2

  const aisleXs = Array.from(
    { length: aisles },
    (_, i) => (i - (aisles - 1) / 2) * AISLE_DX,
  )

  const gondFarZ = BACK_WALL_Z + REAR_MARGIN
  const gondNearZ = gondFarZ + 2 * halfLen
  const frontWallZ = gondNearZ + FRONT_MARGIN
  const gondCenterZ = (gondFarZ + gondNearZ) / 2
  const centerZ = (BACK_WALL_Z + frontWallZ) / 2
  const roomW = (aisles - 1) * AISLE_DX + 2 * EDGE + 1
  const roomD = frontWallZ - BACK_WALL_Z

  return {
    density,
    aisleXs,
    halfLen,
    levels,
    gondCenterZ,
    backWallZ: BACK_WALL_Z,
    frontWallZ,
    centerZ,
    room: { w: roomW, d: roomD, h: ROOM_H },
    camStartZ: frontWallZ - 2.5,
  }
}
