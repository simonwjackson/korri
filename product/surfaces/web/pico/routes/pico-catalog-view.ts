/**
 * Adapts catalog entries into pico's read-only view model (PicoGame). The pico
 * theme components are prop-driven; this maps the live catalog snapshot into the
 * shape they render. Cover art is the catalog's image URL — the pico pixel-art
 * treatment is a future media-pipeline concern, not baked here.
 */
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
} from "@platform/library/playable-library-ui"
import type { PicoGame } from "../fixtures"

export function picoGameFromCatalog(entry: CatalogEntry): PicoGame {
  return {
    id: entry.id,
    title: getPlayableDisplayName(entry),
    genre: "GAME",
    developer: "UNKNOWN",
    favorite: false,
    lastPlayedAt: null,
    lastPlayedLabel: null,
    playtimeLabel: null,
    art: getPlayableImageUrl(entry),
  }
}

export function picoGamesFromCatalog(
  entries: readonly CatalogEntry[],
): readonly PicoGame[] {
  return entries.map(picoGameFromCatalog)
}
