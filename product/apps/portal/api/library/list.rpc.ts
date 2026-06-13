import { EntrySource } from "@platform/api/rpc/entry-source"
import { ApiError } from "@platform/api/rpc/errors"
import { PlayableLibraryEntry } from "@platform/library/playable-library"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

/**
 * Wire shape for entries returned by `app.library.list`.
 *
 * Composed by extending the domain `PlayableLibraryEntry` with the
 * structural `EntrySource` tag — server-side handlers tag local
 * entries with this server's identity; fan-out aggregators tag remote
 * entries with the contributing peer's identity (see U4).
 */
export const LibraryEntry = Schema.Struct({
  ...PlayableLibraryEntry.fields,
  source: EntrySource,
})
export type LibraryEntry = Schema.Schema.Type<typeof LibraryEntry>

export class ListLibraryPayload extends Schema.Class<ListLibraryPayload>(
  "ListLibraryPayload",
)({}) {}

export class ListLibraryResponse extends Schema.Class<ListLibraryResponse>(
  "ListLibraryResponse",
)({
  games: Schema.Array(LibraryEntry),
  /** False when remote peer refreshes are still in flight. */
  complete: Schema.optional(Schema.Boolean),
  /** Catalog snapshot generation that produced this compatibility response. */
  generation: Schema.optional(Schema.Number),
}) {}

export const ListLibraryRpc = Rpc.make("app.library.list", {
  payload: ListLibraryPayload,
  success: ListLibraryResponse,
  error: ApiError,
})
