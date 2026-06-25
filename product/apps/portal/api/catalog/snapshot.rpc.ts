import { EntrySource } from "@platform/api/rpc/entry-source-core"
import { ApiError } from "@platform/api/rpc/errors"
import { PlayableLibraryEntry } from "@platform/library/playable-library"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

const CatalogSnapshotScopeSchema = Schema.Literals(["fabric", "self"])
export type CatalogSnapshotScope = Schema.Schema.Type<
  typeof CatalogSnapshotScopeSchema
>

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
})
export type CatalogEntry = Schema.Schema.Type<typeof CatalogEntrySchema>

export class CatalogPeerSnapshot extends Schema.Class<CatalogPeerSnapshot>(
  "CatalogPeerSnapshot",
)({
  hostId: Schema.String,
  displayName: Schema.String,
  controlUrl: Schema.String,
  isLocal: Schema.Boolean,
  caps: Schema.Array(Schema.String),
  status: CatalogPeerStatusSchema,
  entryCount: Schema.Number,
  updatedAt: Schema.String,
  error: Schema.optional(Schema.String),
}) {}

export class CatalogHealthSummary extends Schema.Class<CatalogHealthSummary>(
  "CatalogHealthSummary",
)({
  coordinatorReachable: Schema.Boolean,
  self: CatalogPeerStatusSchema,
  loadingPeers: Schema.Number,
  readyPeers: Schema.Number,
  failedPeers: Schema.Number,
  lastFailure: Schema.optional(Schema.String),
  generation: Schema.Number,
}) {}

export class CatalogSnapshotPayload extends Schema.Class<CatalogSnapshotPayload>(
  "CatalogSnapshotPayload",
)({
  scope: CatalogSnapshotScopeSchema,
}) {}

export class CatalogSnapshotResponse extends Schema.Class<CatalogSnapshotResponse>(
  "CatalogSnapshotResponse",
)({
  entries: Schema.Array(CatalogEntrySchema),
  peers: Schema.Array(CatalogPeerSnapshot),
  generation: Schema.Number,
  updatedAt: Schema.String,
  health: CatalogHealthSummary,
}) {}

export const CatalogSnapshotRpc = Rpc.make("app.catalog.snapshot", {
  payload: CatalogSnapshotPayload,
  success: CatalogSnapshotResponse,
  error: ApiError,
})
