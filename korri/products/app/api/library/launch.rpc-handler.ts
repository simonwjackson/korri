import { DataError, NotFoundError } from "@shared/api/rpc/errors"
import { normalizeGamescopePolicy } from "@shared/library/config/inheritable-fields"
import {
  Launcher,
  LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import { logger } from "@shared/logger/logger"
import type { ManagedLaunchResult } from "@shared/library/launcher"
import { Effect } from "effect"
import { composeGamescopeLaunchSpec } from "../../../../../tools/device/game-stream-fullscreen"

import { ForegroundSessionHost } from "./foreground-session-host-layer"
import type { LaunchLibraryPayload, LaunchLibraryResponse } from "./launch.rpc"
import { launchLocalForegroundSession } from "./local-foreground-launch-adapter"

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
    const foregroundSessionHost = yield* ForegroundSessionHost
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

    const gamescope = normalizeGamescopePolicy(
      resolvedResult.resolved.gamescope,
    )
    const spec = composeGamescopeLaunchSpec(resolvedResult.resolved.spec, {
      enabled: gamescope.enabled === true,
      ...(gamescope.args !== undefined ? { args: gamescope.args } : {}),
    })

    const result = yield* Effect.tryPromise({
      try: () =>
        launchLocalForegroundSession(foregroundSessionHost.owner, {
          id: payload.id,
          spec,
          spawn: async () => {
            if (!launcher.spawn) return unsupportedManagedSpawn()
            return await Effect.runPromise(
              launcher.spawn(spec).pipe(Effect.mapError(toDataError)),
            )
          },
        }),
      catch: error => toDataError(toLibraryError(error)),
    })

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
    return result
  })

const LAUNCH_CONFIG_ERROR_EXIT_CODE = 124
const MANAGED_LAUNCH_UNSUPPORTED_EXIT_CODE = 125

function unsupportedManagedSpawn(): ManagedLaunchResult {
  return {
    status: "failed",
    result: {
      status: "failed",
      exitCode: MANAGED_LAUNCH_UNSUPPORTED_EXIT_CODE,
      stderrTail: "configured launcher does not support managed spawn",
    },
  }
}

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

function toLibraryError(error: unknown): LibraryError {
  return error instanceof LibraryError
    ? error
    : new LibraryError({
        reason: "io",
        message: error instanceof Error ? error.message : String(error),
      })
}

function toDataError(error: LibraryError): DataError {
  const message = error.message ?? "library launch failed"
  return new DataError({
    reason: "Unavailable",
    message,
  })
}
