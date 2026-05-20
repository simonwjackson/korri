import {
  DataError,
  NotFoundError,
  ValidationError,
} from "@shared/api/rpc/errors"
import { LibrarySource } from "@shared/library/library-services"
import { logger } from "@shared/logger/logger"
import { Effect } from "effect"

import {
  createFileGameStreamLaunchIntentStore,
  createLaunchIntent,
  defaultGameStreamIntentPath,
} from "../../../../../tools/device/game-stream-launch-intent"
import { type PrepareStreamPayload, PrepareStreamResponse } from "./prepare.rpc"

const ENABLED_VALUES = new Set(["1", "true", "yes"])

export const handlePrepareStream = (
  payload: typeof PrepareStreamPayload.Type,
) =>
  Effect.gen(function* () {
    if (!isStreamControlEnabled(process.env)) {
      return yield* Effect.fail(
        new ValidationError({ message: "Korri stream control is not enabled" }),
      )
    }

    const source = yield* LibrarySource
    const spec = yield* source
      .launchSpecFor(payload.id)
      .pipe(
        Effect.mapError(error => toDataError(error, "library prepare failed")),
      )

    if (!spec) {
      logger.warn({ id: payload.id }, "app.stream.prepare: unknown id")
      return yield* Effect.fail(
        new NotFoundError({ message: `Unknown game id: ${payload.id}` }),
      )
    }

    const intentPath = yield* Effect.try({
      try: () => defaultGameStreamIntentPath(process.env),
      catch: error => toWriteError(error),
    })
    const intent = yield* Effect.try({
      try: () => createLaunchIntent(spec),
      catch: error => toDataError(error, "invalid stream launch target"),
    })

    yield* Effect.tryPromise({
      try: () =>
        createFileGameStreamLaunchIntentStore(intentPath).enqueue(intent),
      catch: error => toWriteError(error),
    })

    logger.info(
      { id: payload.id, intentPath },
      "app.stream.prepare: prepared stream launch",
    )
    return new PrepareStreamResponse({
      status: "prepared",
      gameId: payload.id,
      intentPath,
    })
  })

function isStreamControlEnabled(env: NodeJS.ProcessEnv): boolean {
  return ENABLED_VALUES.has(
    (env.KORRI_STREAM_CONTROL_ENABLED ?? "").trim().toLowerCase(),
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
