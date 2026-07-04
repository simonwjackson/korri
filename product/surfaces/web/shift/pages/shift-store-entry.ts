/**
 * Shift store — shared entry view model.
 *
 * The flat, source-agnostic shape every store variant (grid, spotlight, list)
 * renders. It is the projection target of a normalized remote-catalog result
 * (`ProviderClaim`): the store surface never learns which acquisition plugin
 * produced an entry or how, only the fields it needs to show and acquire it.
 * The composition root (device-lab config today, a route later) maps claims
 * into this and decides what "get" does.
 *
 * Everything in the store is free to ACQUIRE — there is no price and no
 * purchase. `status` only decides the affordance verb (Get vs Play), never a
 * cost.
 */
import type { ProviderClaim } from "@platform/protocol/acquisition/claim"

export type ShiftStoreEntryStatus = "available" | "acquiring" | "ready"

export interface ShiftStoreEntry {
  readonly id: string
  readonly title: string
  readonly artUrl: string
  /**
   * Human-readable remote sources this release can be acquired from. A grouped
   * release has MANY (the same game mirrored across providers); a plain one has
   * a single entry. Provenance is only surfaced where there is room to show it
   * (list rows, the spotlight hero, detail) — never on small cards.
   */
  readonly sources: readonly string[]
  readonly genre?: string
  readonly developer?: string
  readonly platform?: string
  /**
   * Acquisition state. `available` shows Get, `acquiring` shows an in-progress
   * label, `ready` shows Play (already acquired, launchable locally).
   */
  readonly status: ShiftStoreEntryStatus
}

const KNOWN_SOURCE_LABELS: Readonly<Record<string, string>> = {
  itchio: "itch.io",
  steamgriddb: "SteamGridDB",
  "community-catalog": "Community",
  smwcentral: "SMW Central",
  levelsharesquare: "Level Share Square",
}

/**
 * Friendly source label for a provider id like `@korri:itchio`. Keeps the store
 * surface independent of the acquisition registry: it reads only the id shape,
 * falls back to a title-cased slug, so a new provider still renders sensibly
 * without a mapping entry.
 */
export function shiftStoreSourceLabel(providerId: string): string {
  const slug = providerId.includes(":")
    ? (providerId.split(":").at(-1) ?? providerId)
    : providerId
  const known = KNOWN_SOURCE_LABELS[slug]
  if (known) return known
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/**
 * Project one normalized remote-catalog claim into the flat store-entry shape.
 * Art prefers the claim thumbnail; acquisition status defaults to `available`
 * (a freshly discovered claim has not been acquired yet). The composition root
 * layers on a live `ready`/`acquiring` status when it has one.
 */
export function shiftStoreEntryFromClaim(
  claim: ProviderClaim,
): ShiftStoreEntry {
  return {
    id: claim.id,
    title: claim.title,
    artUrl: claim.thumbnailUrl ?? "",
    sources: [shiftStoreSourceLabel(claim.providerId)],
    ...(claim.platform ? { platform: claim.platform } : {}),
    status: "available",
  }
}

/**
 * Compact provenance label for the roomy areas that surface where a release
 * comes from. A single source shows its name; a grouped release collapses to a
 * count ("3 sources") so the exact mirrors are a detail-page concern, not a
 * browse-row one. No sources yields an empty string (render nothing).
 */
export function shiftStoreSourcesLabel(sources: readonly string[]): string {
  if (sources.length === 0) return ""
  if (sources.length === 1) return sources[0]
  return `${sources.length} sources`
}
