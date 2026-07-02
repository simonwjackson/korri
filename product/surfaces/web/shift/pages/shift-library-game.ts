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
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"

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

/**
 * The composition-root mapping this module's doc promises: project one catalog
 * entry into the flat library-tile shape. Art prefers the portrait tile role;
 * user data (favourite, last-played, playtime) is not part of the catalog
 * entry and is layered on by the composition root when it has a source for it.
 */
export function shiftLibraryGameFromCatalogEntry(
  entry: CatalogEntry,
): ShiftLibraryGame {
  const tileArt = entry.media?.find(media => media.role === "tile")
  const genre = entry.metadata?.genre?.[0]
  const developer = entry.metadata?.developer
  return {
    id: entry.id,
    title: entry.title ?? entry.metadata?.name ?? entry.id,
    artUrl: tileArt?.url ?? "",
    ...(genre ? { genre } : {}),
    ...(developer ? { developer } : {}),
  }
}
