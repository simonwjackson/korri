import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
} from "@platform/library/playable-library-ui"
import type { Game } from "./steamgriddb"

export function boxbusterGameFromCatalog(entry: CatalogEntry): Game {
  return {
    id: entry.id,
    title: getPlayableDisplayName(entry),
    year: 2026,
    platform: (entry.system ?? "game").toUpperCase(),
    genre: "Game",
    players: "1+ Players",
    blurb: "Catalog-seeded game ready for the Boxbuster shelf.",
    coverUrl: getPlayableImageUrl(entry),
  }
}

export function boxbusterGamesFromCatalog(
  entries: readonly CatalogEntry[],
): readonly Game[] {
  return entries.map(boxbusterGameFromCatalog)
}
