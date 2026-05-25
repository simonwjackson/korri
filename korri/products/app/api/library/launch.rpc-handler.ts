import { DataError, NotFoundError } from "@shared/api/rpc/errors"
import { normalizeGamescopePolicy } from "@shared/library/config/inheritable-fields"
import {
  Launcher,
  type LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import { composeGamescopeLaunchSpec } from "../../../../../tools/device/game-stream-fullscreen"
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
    const games = yield* source.list().pipe(Effect.mapError(toDataError))
    if (!games.some(game => game.id === payload.id)) {
      logger.warn(
        { id: payload.id },
        "app.library.launch: unknown id; nothing to spawn",
      )
      return yield* Effect.fail(
        new NotFoundError({ message: `Unknown game id: ${payload.id}` }),
      )
    }

    const resolvedResult = yield* source
      .resolveLaunchForGame(payload.id, {
        userId: payload.userId,
        presetId: payload.presetId ?? undefined,
        override: payload.override,
      })
      .pipe(
        Effect.matchEffect({
          onSuccess: resolved =>
            Effect.succeed({ _tag: "resolved" as const, resolved }),
          onFailure: (error: LibraryError) =>
            error.reason === "config"
              ? Effect.succeed({
                  _tag: "failed" as const,
                  response: launchConfigurationFailure(error),
                })
              : Effect.fail(toDataError(error)),
        }),
      )

    if (resolvedResult._tag === "failed") {
      logger.warn(
        { id: payload.id, diagnostic: resolvedResult.response.stderrTail },
        "app.library.launch: launch configuration failed",
      )
      return resolvedResult.response
    }

    const spec = composeGamescopeLaunchSpec(
      resolvedResult.resolved.spec,
      normalizeGamescopePolicy(resolvedResult.resolved.gamescope),
    )

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
