/**
 * Composite key shared by every UI surface that needs structural
 * source identity for library entries — rails, focus targets,
 * `data-tile-id`, route params, asset caches.
 *
 * Plain `entry.id` is not sufficient once the rail mixes entries from
 * multiple peers: two peers can legitimately advertise the same id
 * (e.g., `pico-8/celeste` on both Sobo and AKA) and they MUST render
 * as two distinct focusables (AE3). The composite is
 * `${source.hostId}::${entry.id}`.
 *
 * Falls back to bare id when source is absent — preserves behavior
 * for fixtures, stories, and any non-federated caller. Parsers split
 * on the FIRST `::` so ids containing the separator round-trip
 * correctly.
 */

export interface EntrySourceTag {
  readonly hostId: string
  readonly controlUrl: string
  readonly isLocal: boolean
}

/**
 * Minimal contract for keying: only `source.hostId` is consumed.
 * Generic over the wider source shape so callers with `EntrySourceTag`,
 * `{ hostId }`, or RPC-decoded shapes all satisfy the parameter
 * without mismatched structural types.
 */
export interface EntryWithOptionalSource {
  readonly id: string
  readonly source?: { readonly hostId: string }
}

const SEPARATOR = "::"

export function composeEntryKey<
  T extends {
    readonly id: string
    readonly source?: { readonly hostId: string }
  },
>(entry: T): string {
  const hostId = entry.source?.hostId
  if (!hostId || hostId.length === 0) return entry.id
  return `${hostId}${SEPARATOR}${entry.id}`
}

export interface ParsedEntryKey {
  readonly hostId: string | undefined
  readonly id: string
}

export function parseEntryKey(key: string): ParsedEntryKey {
  const separatorIndex = key.indexOf(SEPARATOR)
  if (separatorIndex < 0) return { hostId: undefined, id: key }
  return {
    hostId: key.slice(0, separatorIndex),
    id: key.slice(separatorIndex + SEPARATOR.length),
  }
}
