import { DataError } from "@shared/api/rpc/errors"
import { getLibraryContext } from "@shared/library/library-context"
import { logger } from "@shared/logger/logger"
import { Effect } from "effect"

import type { ListLibraryPayload } from "./list.rpc"

export const handleListLibrary = (_payload: typeof ListLibraryPayload.Type) =>
  Effect.tryPromise({
    try: () => getLibraryContext().source.list(),
    catch: error => {
      const message =
        error instanceof Error ? error.message : "library list failed"
      logger.error(
        { error: message },
        "app.library.list: source.list() rejected",
      )
      return new DataError({
        reason: "ReadFailed",
        message,
      })
    },
  }).pipe(Effect.map(games => ({ games })))
