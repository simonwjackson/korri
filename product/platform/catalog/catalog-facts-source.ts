import { EntrySource } from "@platform/api/rpc/entry-source"
import { LaunchAlternative } from "@platform/library/launch-alternative"
import { PlayableLibraryEntry } from "@platform/library/playable-library"
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

const CatalogPeerStatusSchema = Schema.Literals(["loading", "ready", "failed"])
const CatalogEntryAvailabilitySchema = Schema.Literals([
  "local-launchable",
  "remote-available",
  "remote-unreachable",
])

const CatalogEntrySchema = Schema.Struct({
  ...PlayableLibraryEntry.fields,
  source: EntrySource,
  availability: Schema.optional(CatalogEntryAvailabilitySchema),
  launchAlternatives: Schema.optional(Schema.Array(LaunchAlternative)),
})

const CatalogPeerSnapshotSchema = Schema.Struct({
  hostId: Schema.String,
  displayName: Schema.String,
  controlUrl: Schema.String,
  isLocal: Schema.Boolean,
  caps: Schema.Array(Schema.String),
  status: CatalogPeerStatusSchema,
  entryCount: Schema.Number,
  updatedAt: Schema.String,
  error: Schema.optional(Schema.String),
})

const CatalogHealthSummarySchema = Schema.Struct({
  coordinatorReachable: Schema.Boolean,
  self: CatalogPeerStatusSchema,
  loadingPeers: Schema.Number,
  readyPeers: Schema.Number,
  failedPeers: Schema.Number,
  lastFailure: Schema.optional(Schema.String),
  generation: Schema.Number,
})

const CatalogSnapshotFactsSchema = Schema.Struct({
  entries: Schema.Array(CatalogEntrySchema),
  peers: Schema.Array(CatalogPeerSnapshotSchema),
  generation: Schema.Number,
  updatedAt: Schema.String,
  health: CatalogHealthSummarySchema,
})

export function decodeCatalogSnapshotFacts(
  value: unknown,
): CatalogSnapshotFacts {
  const decoded = Schema.decodeUnknownSync(CatalogSnapshotFactsSchema)(value)
  for (const entry of decoded.entries) {
    const lastPlayed = entry.playStats?.lastPlayed
    if (lastPlayed !== undefined && Number.isNaN(lastPlayed.getTime())) {
      throw new Error("app.catalog.snapshot: invalid playStats.lastPlayed")
    }
  }
  return decoded
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
