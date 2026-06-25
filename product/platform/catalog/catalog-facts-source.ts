import type { EntrySource } from "@platform/api/rpc/entry-source"
import type { LaunchAlternative } from "@platform/library/launch-alternative"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { Context, Effect, Layer, Schema } from "effect"

export class CatalogFactsError extends Schema.TaggedErrorClass<CatalogFactsError>()(
  "CatalogFactsError",
  {
    reason: Schema.Literals(["unavailable", "invalid"]),
    message: Schema.optional(Schema.String),
  },
) {}

export type CatalogPeerStatus = "loading" | "ready" | "failed"
export type CatalogSnapshotScope = "fabric" | "self"

export type CatalogEntryAvailability =
  | "local-launchable"
  | "remote-available"
  | "remote-unreachable"

export type CatalogEntry = PlayableLibraryEntry & {
  readonly source: EntrySource
  readonly availability?: CatalogEntryAvailability
  readonly launchAlternatives?: readonly LaunchAlternative[]
}

export interface CatalogPeerSnapshot {
  readonly hostId: string
  readonly displayName: string
  readonly controlUrl: string
  readonly isLocal: boolean
  readonly caps: readonly string[]
  readonly status: CatalogPeerStatus
  readonly entryCount: number
  readonly updatedAt: string
  readonly error?: string
}

export interface CatalogHealthSummary {
  readonly coordinatorReachable: boolean
  readonly self: CatalogPeerStatus
  readonly loadingPeers: number
  readonly readyPeers: number
  readonly failedPeers: number
  readonly lastFailure?: string
  readonly generation: number
}

export interface CatalogSnapshotFacts {
  readonly entries: readonly CatalogEntry[]
  readonly peers: readonly CatalogPeerSnapshot[]
  readonly generation: number
  readonly updatedAt: string
  readonly health: CatalogHealthSummary
}

export interface CatalogFactsSourceService {
  readonly snapshot: (
    scope?: CatalogSnapshotScope,
  ) => Effect.Effect<CatalogSnapshotFacts, CatalogFactsError>
}

export class CatalogFactsSource extends Context.Service<
  CatalogFactsSource,
  CatalogFactsSourceService
>()("CatalogFactsSource") {}

export const loadingForeverCatalogFactsSourceLayer = Layer.succeed(
  CatalogFactsSource,
)({
  snapshot: () => Effect.never,
})

export function makeInMemoryCatalogFactsSourceLayer(
  facts: CatalogSnapshotFacts,
) {
  return Layer.succeed(CatalogFactsSource)({
    snapshot: () => Effect.succeed(facts),
  })
}
