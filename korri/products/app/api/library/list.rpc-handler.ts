import { DataError } from "@shared/api/rpc/errors"
import {
  type LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import { logger } from "@shared/logger/logger"
import { Effect } from "effect"

import type { ListLibraryPayload } from "./list.rpc"

export const handleListLibrary = (_payload: typeof ListLibraryPayload.Type) =>
  Effect.gen(function* () {
    const source = yield* LibrarySource
    const games = yield* source.list().pipe(Effect.mapError(toDataError))
    return { games }
  })

function toDataError(error: LibraryError): DataError {
  const message = error.message ?? "library list failed"
  logger.error({ error: message }, "app.library.list: source.list() rejected")
  return new DataError({
    reason: "ReadFailed",
    message,
  })
}
