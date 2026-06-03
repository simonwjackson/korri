import { join } from "node:path"
import {
  DataError,
  NotFoundError,
  ValidationError,
} from "@shared/api/rpc/errors"
import type { EphemeralOverride } from "@shared/library/config/ephemeral-override"
import { LibrarySource } from "@shared/library/library-services"
import { logger } from "@shared/logger/logger"
import { Effect } from "effect"

import {
  createFileGameStreamLaunchIntentStore,
  createLaunchIntent,
} from "../../../../../product/services/device/game-stream-launch-intent"
import { isStreamControlEnabled } from "./control-mode"
import { type PrepareStreamPayload, PrepareStreamResponse } from "./prepare.rpc"

export interface PreparedStreamLaunch {
  readonly gameId: string
  readonly sessionId: string
  readonly intentPath: string
}

export const handlePrepareStream = (
  payload: typeof PrepareStreamPayload.Type,
) =>
  prepareStreamLaunch(payload.id, {
    userId: payload.userId,
    presetId: payload.presetId ?? undefined,
    override: payload.override,
  }).pipe(
    Effect.map(
      prepared =>
        new PrepareStreamResponse({
          status: "prepared",
          gameId: prepared.gameId,
          intentPath: prepared.intentPath,
        }),
    ),
  )

export interface PrepareStreamLaunchOptions {
  readonly userId?: string
  readonly presetId?: string
  readonly override?: EphemeralOverride
  readonly runtimeDir?: string
}

export function prepareStreamLaunch(
  gameId: string,
  options: PrepareStreamLaunchOptions = {},
): Effect.Effect<
  PreparedStreamLaunch,
  DataError | NotFoundError | ValidationError,
  LibrarySource
> {
  return Effect.gen(function* () {
    if (!isStreamControlEnabled(process.env)) {
      return yield* Effect.fail(
        new ValidationError({ message: "Korri stream control is not enabled" }),
      )
    }

    const source = yield* LibrarySource
    const games = yield* source
      .list()
      .pipe(
        Effect.mapError(error => toDataError(error, "library prepare failed")),
      )
    if (!games.some(game => game.id === gameId)) {
      logger.warn({ id: gameId }, "app.stream.prepare: unknown id")
      return yield* Effect.fail(
        new NotFoundError({ message: `Unknown game id: ${gameId}` }),
      )
    }

    const resolved = yield* source
      .resolveLaunchForGame(gameId, {
        userId: options.userId,
        presetId: options.presetId,
        override: options.override,
      })
      .pipe(
        Effect.mapError(error => toDataError(error, "library prepare failed")),
      )

    const intentPath = yield* Effect.try({
      try: () => intentPathForOptions(options),
      catch: error => toWriteError(error),
    })
    const intent = yield* Effect.try({
      try: () =>
        createLaunchIntent(resolved.spec, { gamescope: resolved.gamescope }),
      catch: error => toDataError(error, "invalid stream launch target"),
    })

    yield* Effect.tryPromise({
      try: () =>
        createFileGameStreamLaunchIntentStore(intentPath).enqueue(intent),
      catch: error => toWriteError(error),
    })

    logger.info(
      { id: gameId, intentPath, sessionId: intent.id },
      "app.stream.prepare: prepared stream launch",
    )
    return {
      gameId,
      sessionId: intent.id,
      intentPath,
    }
  })
}

function intentPathForOptions(options: PrepareStreamLaunchOptions): string {
  if (options.runtimeDir) return join(options.runtimeDir, "next-launch.json")
  if (process.env.KORRI_GAME_STREAM_INTENT_PATH) {
    return process.env.KORRI_GAME_STREAM_INTENT_PATH
  }
  if (process.env.XDG_RUNTIME_DIR) {
    return join(
      process.env.XDG_RUNTIME_DIR,
      "korri-game-stream",
      "next-launch.json",
    )
  }
  throw new Error(
    "runtimeDir, KORRI_GAME_STREAM_INTENT_PATH, or XDG_RUNTIME_DIR is required for launch intents",
  )
}

function toDataError(error: unknown, fallback: string): DataError {
  const message = errorMessage(error) ?? fallback
  return new DataError({ reason: "Unavailable", message })
}

function toWriteError(error: unknown): DataError {
  return new DataError({
    reason: "WriteFailed",
    message: errorMessage(error) ?? "stream prepare failed",
  })
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { readonly message?: unknown }).message
    if (typeof message === "string") return message
  }
  if (typeof error === "string") return error
  return undefined
}
