import type { GameRecord } from "@platform/fixtures/games/game"
import { getGameDisplayName } from "@platform/fixtures/games/game"
import { cleanupLaunchArtifacts } from "@platform/library/config/app-materializer"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import type { LaunchSpec } from "@platform/library/launcher"
import {
  LibraryError,
  type LibrarySourceService,
} from "@platform/library/library-services"
import { Cause, Effect, Exit } from "effect"
import {
  createLaunchIntent,
  type GameStreamLaunchIntent,
  type GameStreamLaunchIntentStore,
} from "@product/services/device/game-stream-launch-intent"
import type { GamePicker } from "./game-picker"

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
  readonly gameId?: string
  readonly message: string
  readonly diagnostic?: string
}

export type StreamLaunchFailureCategory =
  | "usage"
  | "no-such-game"
  | "library-config"
  | "prepare-failed"
  | "cancelled"

export interface PrepareStreamLaunchOptions {
  readonly gameId?: string
  readonly librarySource: LibrarySourceService
  readonly intentStore: GameStreamLaunchIntentStore
  readonly gamePicker?: GamePicker
  readonly stdinIsTty?: boolean
}

export interface RunStreamLaunchCommandOptions
  extends PrepareStreamLaunchOptions {
  readonly intentPath?: string
  readonly output?: (line: string) => void
  readonly errorOutput?: (line: string) => void
}

export async function runStreamLaunchCommand(
  options: RunStreamLaunchCommandOptions,
): Promise<number> {
  const result = await prepareStreamLaunch(options)
  if (result.status === "prepared") {
    writeLines(
      options.output ?? console.log,
      successMessage(result, options.intentPath),
    )
    return 0
  }

  writeLines(options.errorOutput ?? console.error, failureMessage(result))
  return exitCodeForFailure(result.category)
}

export async function prepareStreamLaunch(
  options: PrepareStreamLaunchOptions,
): Promise<StreamLaunchPrepareResult> {
  const gameId = options.gameId?.trim()
  if (gameId !== undefined) {
    if (gameId.length === 0) return usageFailure("Game id must not be empty")
    return await prepareStreamLaunchForGame({ ...options, gameId })
  }

  if (options.stdinIsTty === false) {
    return usageFailure(
      "Pass a game id when running without an interactive terminal",
    )
  }
  if (!options.gamePicker) {
    return usageFailure("Interactive game selection is unavailable")
  }

  const gamesResult = await runLibraryEffect(options.librarySource.list())
  if (!gamesResult.ok) return libraryFailure(undefined, gamesResult.error)
  if (gamesResult.value.length === 0) {
    return {
      status: "failed",
      category: "library-config",
      message: "The configured Korri library has no games",
    }
  }

  let game: GameRecord | undefined
  try {
    game = await options.gamePicker(gamesResult.value)
  } catch (error) {
    return {
      status: "failed",
      category: "prepare-failed",
      message: "Interactive game selection failed",
      diagnostic: errorMessage(error),
    }
  }
  if (!game) {
    return {
      status: "failed",
      category: "cancelled",
      message: "Stream launch preparation cancelled",
    }
  }

  return await prepareKnownGameStreamLaunch({
    game,
    librarySource: options.librarySource,
    intentStore: options.intentStore,
  })
}

export async function prepareStreamLaunchForGame(
  options: PrepareStreamLaunchOptions & { readonly gameId: string },
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

  return await prepareKnownGameStreamLaunch({
    game,
    librarySource: options.librarySource,
    intentStore: options.intentStore,
  })
}

async function prepareKnownGameStreamLaunch(options: {
  readonly game: GameRecord
  readonly librarySource: LibrarySourceService
  readonly intentStore: GameStreamLaunchIntentStore
}): Promise<StreamLaunchPrepareResult> {
  const resolvedResult = await runLibraryEffect(
    options.librarySource.resolveLaunchForGame(options.game.id),
  )
  if (!resolvedResult.ok)
    return libraryFailure(options.game.id, resolvedResult.error)

  return await enqueueLaunchIntent({
    game: options.game,
    gameId: options.game.id,
    spec: resolvedResult.value.spec,
    launchCompanions: resolvedResult.value.launchCompanions,
    launchMetadata: resolvedResult.value.launchMetadata,
    artifacts: resolvedResult.value.artifacts,
    intentStore: options.intentStore,
  })
}

function usageFailure(message: string): StreamLaunchPrepareFailure {
  return {
    status: "failed",
    category: "usage",
    message,
  }
}

function successMessage(
  result: Extract<StreamLaunchPrepareResult, { readonly status: "prepared" }>,
  intentPath: string | undefined,
): readonly string[] {
  return [
    `Prepared ${result.displayName} (${result.game.id}) for Korri Stream.`,
    "Next: connect to the Korri Stream app from Moonlight.",
    "This is a one-shot launch intent; rerun this command before a later stream attempt.",
    ...(intentPath ? [`Intent: ${intentPath}`] : []),
  ]
}

function failureMessage(
  failure: StreamLaunchPrepareFailure,
): readonly string[] {
  return [failure.message, ...(failure.diagnostic ? [failure.diagnostic] : [])]
}

function writeLines(
  output: (line: string) => void,
  lines: readonly string[],
): void {
  for (const line of lines) output(line)
}

function exitCodeForFailure(category: StreamLaunchFailureCategory): number {
  switch (category) {
    case "usage":
      return 2
    case "no-such-game":
      return 3
    case "library-config":
      return 5
    case "prepare-failed":
      return 6
    case "cancelled":
      return 130
  }
}

async function enqueueLaunchIntent(options: {
  readonly game: GameRecord
  readonly gameId: string
  readonly spec: LaunchSpec
  readonly launchCompanions?: GameStreamLaunchIntent["launchCompanions"]
  readonly launchMetadata?: GameStreamLaunchIntent["launchMetadata"]
  readonly artifacts?: LaunchArtifacts
  readonly intentStore: GameStreamLaunchIntentStore
}): Promise<StreamLaunchPrepareResult> {
  let intent: GameStreamLaunchIntent
  try {
    intent = createLaunchIntent(options.spec, {
      launchCompanions: options.launchCompanions,
      launchMetadata: options.launchMetadata,
      artifacts: options.artifacts,
    })
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
    await Effect.runPromise(cleanupLaunchArtifacts(options.artifacts))
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
  gameId: string | undefined,
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
