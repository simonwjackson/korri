import { EntrySource } from "@shared/api/rpc/entry-source"
import { ApiError } from "@shared/api/rpc/errors"
import { ResolvedGameRecord } from "@shared/fixtures/games/game"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

/**
 * Wire shape for entries returned by `app.library.list`.
 *
 * Composed by extending the domain `ResolvedGameRecord` with the
 * structural `EntrySource` tag — server-side handlers tag local
 * entries with this server's identity; fan-out aggregators tag remote
 * entries with the contributing peer's identity (see U4).
 */
export const LibraryEntry = Schema.Struct({
  ...ResolvedGameRecord.fields,
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
}) {}

export const ListLibraryRpc = Rpc.make("app.library.list", {
  payload: ListLibraryPayload,
  success: ListLibraryResponse,
  error: ApiError,
})
