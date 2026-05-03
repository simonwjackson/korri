import { DataError, NotFoundError } from "@shared/api/rpc/errors"
import {
  Launcher,
  type LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import { logger } from "@shared/logger/logger"
import { Effect } from "effect"

import type { LaunchLibraryPayload, LaunchLibraryResponse } from "./launch.rpc"

export const handleLaunchLibrary = (
  payload: typeof LaunchLibraryPayload.Type,
) =>
  Effect.gen(function* () {
    const source = yield* LibrarySource
    const launcher = yield* Launcher
    const spec = yield* source
      .launchSpecFor(payload.id)
      .pipe(Effect.mapError(toDataError))

    if (!spec) {
      logger.warn(
        { id: payload.id },
        "app.library.launch: unknown id; nothing to spawn",
      )
      return yield* Effect.fail(
        new NotFoundError({ message: `Unknown game id: ${payload.id}` }),
      )
    }

    const result = yield* launcher.run(spec).pipe(Effect.mapError(toDataError))

    if (result.status === "launched") {
      logger.info(
        { id: payload.id, command: spec.command, exitCode: 0 },
        "app.library.launch: launched",
      )
      return { status: "launched" } satisfies LaunchLibraryResponse
    }

    logger.warn(
      { id: payload.id, command: spec.command, exitCode: result.exitCode },
      "app.library.launch: failed",
    )
    return result.stderrTail !== undefined
      ? ({
          status: "failed",
          exitCode: result.exitCode,
          stderrTail: result.stderrTail,
        } satisfies LaunchLibraryResponse)
      : ({
          status: "failed",
          exitCode: result.exitCode,
        } satisfies LaunchLibraryResponse)
  })

function toDataError(error: LibraryError): DataError {
  const message = error.message ?? "library launch failed"
  return new DataError({
    reason: "Unavailable",
    message,
  })
}
