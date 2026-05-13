import { DataError, NotFoundError } from "@shared/api/rpc/errors"
import {
  Launcher,
  type LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import { logger } from "@shared/logger/logger"
import { Effect } from "effect"

import type { LaunchLibraryPayload, LaunchLibraryResponse } from "./launch.rpc"

type FailedLaunchLibraryResponse = Extract<
  LaunchLibraryResponse,
  { readonly status: "failed" }
>

export const handleLaunchLibrary = (
  payload: typeof LaunchLibraryPayload.Type,
) =>
  Effect.gen(function* () {
    const source = yield* LibrarySource
    const launcher = yield* Launcher
    const specResult = yield* source.launchSpecFor(payload.id).pipe(
      Effect.map(spec => ({ _tag: "spec" as const, spec })),
      Effect.catch(error =>
        error.reason === "config"
          ? Effect.succeed({
              _tag: "failed" as const,
              response: launchConfigurationFailure(error),
            })
          : Effect.fail(toDataError(error)),
      ),
    )

    if (specResult._tag === "failed") {
      logger.warn(
        { id: payload.id, diagnostic: specResult.response.stderrTail },
        "app.library.launch: launch configuration failed",
      )
      return specResult.response
    }

    const { spec } = specResult

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

const LAUNCH_CONFIG_ERROR_EXIT_CODE = 124

function launchConfigurationFailure(
  error: LibraryError,
): FailedLaunchLibraryResponse {
  return {
    status: "failed",
    exitCode: LAUNCH_CONFIG_ERROR_EXIT_CODE,
    stderrTail:
      error.message ?? error.diagnostic ?? "launch configuration failed",
  }
}

function toDataError(error: LibraryError): DataError {
  const message = error.message ?? "library launch failed"
  return new DataError({
    reason: "Unavailable",
    message,
  })
}
