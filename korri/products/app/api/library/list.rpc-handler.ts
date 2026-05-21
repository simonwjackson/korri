import { DataError } from "@shared/api/rpc/errors"
import {
  type LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import { logger } from "@shared/logger/logger"
import { Effect } from "effect"

import { type ListLibraryPayload, ListLibraryResponse } from "./list.rpc"

/**
 * Returns the full library from whatever LibrarySource is provided by
 * the host (proseql, manual, etc.).
 *
 * The legacy `KORRI_HEADLESS_SOURCE_ONLY` gate that used to reject this
 * RPC has been retired: the desktop-as-server-client refactor exposes
 * `app.library.list` from the unified server RPC group, so a deployment
 * that runs the server is meant to BE the library. Source-only deploys
 * still expose `app.source.list` separately, but they're no longer
 * special-cased here.
 */
export const handleListLibrary = (_payload: typeof ListLibraryPayload.Type) =>
  Effect.gen(function* () {
    const source = yield* LibrarySource
    const games = yield* source.list().pipe(Effect.mapError(toDataError))
    return new ListLibraryResponse({ games })
  })

function toDataError(error: LibraryError): DataError {
  const message = error.message ?? "library list failed"
  logger.error({ error: message }, "app.library.list: source.list() rejected")
  return new DataError({
    reason: "ReadFailed",
    message,
  })
}
