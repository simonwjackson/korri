/**
 * Shift library — shared tile view model.
 *
 * A flat, source-agnostic shape every library variant (grid, shelves, lens,
 * filter-bar) renders, so no page imports another and none knows about library
 * wiring. The composition root (device-lab config today, a route later) maps
 * catalog entries into this.
 *
 * Sortable fields are RAW (epoch ms / minutes), not pre-formatted labels, so the
 * shared query core can order on them; display labels are derived at render.
 */
export interface ShiftLibraryGame {
  readonly id: string
  readonly title: string
  readonly artUrl: string
  readonly genre?: string
  readonly developer?: string
  readonly favorite?: boolean
  /** Last-played time as epoch ms. Sortable; absent = never played. */
  readonly lastPlayedAt?: number
  /** Total playtime in minutes. Sortable; absent = unknown. */
  readonly playtimeMinutes?: number
}
