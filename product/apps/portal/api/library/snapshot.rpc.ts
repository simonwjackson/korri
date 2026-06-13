import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import { LibraryEntry } from "./list.rpc"

export const CatalogPeerStatus = Schema.Literals([
  "loading",
  "ready",
  "failed",
])

export class CatalogPeerSnapshot extends Schema.Class<CatalogPeerSnapshot>(
  "CatalogPeerSnapshot",
)({
  hostId: Schema.String,
  displayName: Schema.String,
  controlUrl: Schema.String,
  isLocal: Schema.Boolean,
  caps: Schema.Array(Schema.String),
  status: CatalogPeerStatus,
  entryCount: Schema.Number,
  updatedAt: Schema.String,
  error: Schema.optional(Schema.String),
}) {}

export class CatalogHealthSummary extends Schema.Class<CatalogHealthSummary>(
  "CatalogHealthSummary",
)({
  coordinatorReachable: Schema.Boolean,
  self: CatalogPeerStatus,
  loadingPeers: Schema.Number,
  readyPeers: Schema.Number,
  failedPeers: Schema.Number,
  lastFailure: Schema.optional(Schema.String),
  generation: Schema.Number,
}) {}

export class LibrarySnapshotPayload extends Schema.Class<LibrarySnapshotPayload>(
  "LibrarySnapshotPayload",
)({}) {}

export class LibrarySnapshotResponse extends Schema.Class<LibrarySnapshotResponse>(
  "LibrarySnapshotResponse",
)({
  entries: Schema.Array(LibraryEntry),
  peers: Schema.Array(CatalogPeerSnapshot),
  generation: Schema.Number,
  updatedAt: Schema.String,
  health: CatalogHealthSummary,
}) {}

export const LibrarySnapshotRpc = Rpc.make("app.library.snapshot", {
  payload: LibrarySnapshotPayload,
  success: LibrarySnapshotResponse,
  error: ApiError,
})
