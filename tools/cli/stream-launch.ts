import type { GameRecord } from "@shared/fixtures/games/game"
import { getGameDisplayName } from "@shared/fixtures/games/game"
import {
  LibraryError,
  type LibrarySourceService,
} from "@shared/library/library-services"
import type { LaunchSpec } from "@shared/library/launcher"
import { Cause, Effect, Exit } from "effect"
import {
  createLaunchIntent,
  type GameStreamLaunchIntent,
  type GameStreamLaunchIntentStore,
} from "../device/game-stream-launch-intent"

export type StreamLaunchPrepareResult =
  | {
      readonly status: "prepared"
      readonly game: GameRecord
      readonly displayName: string
      readonly intent: GameStreamLaunchIntent
    }
  | StreamLaunchPrepareFailure

export type StreamLaunchPrepareFailure = {
  readonly status: "failed"
  readonly category: StreamLaunchFailureCategory
  readonly gameId: string
  readonly message: string
  readonly diagnostic?: string
}

export type StreamLaunchFailureCategory =
  | "no-such-game"
  | "library-config"
  | "prepare-failed"

export interface PrepareStreamLaunchOptions {
  readonly gameId: string
  readonly librarySource: LibrarySourceService
  readonly intentStore: GameStreamLaunchIntentStore
}

export async function prepareStreamLaunchForGame(
  options: PrepareStreamLaunchOptions,
): Promise<StreamLaunchPrepareResult> {
  const gameId = options.gameId.trim()
  const gamesResult = await runLibraryEffect(options.librarySource.list())
  if (!gamesResult.ok) return libraryFailure(gameId, gamesResult.error)

  const game = gamesResult.value.find(candidate => candidate.id === gameId)
  if (!game) {
    return {
      status: "failed",
      category: "no-such-game",
      gameId,
      message: `No game exists with id ${gameId}`,
    }
  }

  const specResult = await runLibraryEffect(
    options.librarySource.launchSpecFor(gameId),
  )
  if (!specResult.ok) return libraryFailure(gameId, specResult.error)
  if (!specResult.value) {
    return {
      status: "failed",
      category: "library-config",
      gameId,
      message: `Game ${gameId} does not have a launch target`,
    }
  }

  return await enqueueLaunchIntent({
    game,
    gameId,
    spec: specResult.value,
    intentStore: options.intentStore,
  })
}

async function enqueueLaunchIntent(options: {
  readonly game: GameRecord
  readonly gameId: string
  readonly spec: LaunchSpec
  readonly intentStore: GameStreamLaunchIntentStore
}): Promise<StreamLaunchPrepareResult> {
  let intent: GameStreamLaunchIntent
  try {
    intent = createLaunchIntent(options.spec)
  } catch (error) {
    return {
      status: "failed",
      category: "library-config",
      gameId: options.gameId,
      message: `Game ${options.gameId} resolved to an invalid stream launch target`,
      diagnostic: errorMessage(error),
    }
  }

  try {
    await options.intentStore.enqueue(intent)
  } catch (error) {
    return {
      status: "failed",
      category: "prepare-failed",
      gameId: options.gameId,
      message: `Could not prepare stream launch for ${options.gameId}`,
      diagnostic: errorMessage(error),
    }
  }

  return {
    status: "prepared",
    game: options.game,
    displayName: getGameDisplayName(options.game),
    intent,
  }
}

async function runLibraryEffect<T>(
  effect: Effect.Effect<T, LibraryError>,
): Promise<
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown }
> {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) return { ok: true, value: exit.value }
  return { ok: false, error: Cause.squash(exit.cause) }
}

function libraryFailure(
  gameId: string,
  error: unknown,
): StreamLaunchPrepareFailure {
  if (error instanceof LibraryError) {
    return {
      status: "failed",
      category: "library-config",
      gameId,
      message: libraryErrorMessage(error),
      diagnostic: error.diagnostic,
    }
  }

  return {
    status: "failed",
    category: "library-config",
    gameId,
    message: errorMessage(error),
  }
}

function libraryErrorMessage(error: LibraryError): string {
  if (error.message) return error.message
  switch (error.reason) {
    case "config":
      return "Library configuration problem"
    case "io":
      return "Could not read the configured library"
    case "unavailable":
      return "Library source is unavailable"
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
