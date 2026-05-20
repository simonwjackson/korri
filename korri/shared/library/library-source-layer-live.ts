import { korriDataPath } from "@shared/config/xdg-paths"
import { logger } from "@shared/logger"
import { Effect, Layer } from "effect"
import {
  LibraryError,
  LibrarySource,
  type LibrarySourceService,
} from "./library-services"
import type { LibrarySource as PlainLibrarySource } from "./library-source"
import { openKorriLibraryDb } from "./proseql/library-db"
import {
  createLibraryRepository,
  type LibraryRepository,
} from "./proseql/library-repository"
import {
  createRocknixSource,
  DEFAULT_ROCKNIX_ES_SYSTEMS_PATH,
  DEFAULT_ROCKNIX_GAMELIST_ROOTS,
  defaultRocknixMediaRoot,
  type RocknixConfig,
} from "./rocknix/rocknix-source"

type LibrarySourceMode = "proseql" | "rocknix"

export const LibrarySourceLayerLive = Layer.succeed(
  LibrarySource,
  createLiveLibrarySourceService(),
)

function createLiveLibrarySourceService(): LibrarySourceService {
  return {
    list: () =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(source => source.list(), "list")
        : withLibraryRepository(repository => repository.listGames(), "list"),
    launchSpecFor: id =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(source => source.launchSpecFor(id), "launchSpecFor")
        : withLibraryRepository(
            repository => repository.launchSpecForGame(id),
            "launchSpecFor",
          ),
  }
}

function withRocknixSource<T>(
  useSource: (source: PlainLibrarySource) => Promise<T>,
  operation: string,
): Effect.Effect<T, LibraryError> {
  return Effect.try({
    try: buildRocknixConfigFromEnv,
    catch: toLibraryError,
  }).pipe(
    Effect.flatMap(config => {
      logger.info(
        {
          sourceKind: "rocknix",
          operation,
          gamelistRoots: config.gamelistRoots,
          esSystemsPath: config.esSystemsPath,
          allowMissingEsSystems: config.allowMissingEsSystems,
        },
        "library-source-layer-live: opening ROCKNIX gamelists",
      )

      return Effect.tryPromise({
        try: () => useSource(createRocknixSource(config)),
        catch: toLibraryError,
      })
    }),
  )
}

function withLibraryRepository<T>(
  useRepository: (repository: LibraryRepository) => Effect.Effect<T, unknown>,
  operation: string,
): Effect.Effect<T, LibraryError> {
  return Effect.scoped(
    Effect.gen(function* () {
      const root = yield* buildLibraryRootFromEnv()
      logger.info(
        { sourceKind: "proseql", operation, root },
        "library-source-layer-live: opening ProseQL library",
      )
      const db = yield* openKorriLibraryDb({ root })
      return yield* useRepository(createLibraryRepository(db))
    }),
  ).pipe(Effect.mapError(toLibraryError))
}

function selectedLibrarySourceMode(): LibrarySourceMode {
  const explicit = process.env.KORRI_LIBRARY_SOURCE?.trim().toLowerCase()
  if (explicit === "rocknix" || explicit === "proseql") return explicit

  return "proseql"
}

function buildRocknixConfigFromEnv(): RocknixConfig {
  return {
    gamelistRoots:
      parseListEnv(process.env.KORRI_ROCKNIX_GAMELIST_ROOTS) ??
      DEFAULT_ROCKNIX_GAMELIST_ROOTS,
    esSystemsPath:
      optionalEnv(process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH) ??
      DEFAULT_ROCKNIX_ES_SYSTEMS_PATH,
    launchCommand: optionalEnv(process.env.KORRI_ROCKNIX_LAUNCH_COMMAND),
    mediaRoot:
      optionalEnv(process.env.KORRI_ROCKNIX_MEDIA_ROOT) ??
      defaultRocknixMediaRoot(process.env),
    allowMissingEsSystems: true,
  }
}

function parseListEnv(
  value: string | undefined,
): readonly string[] | undefined {
  const items = value
    ?.split(":")
    .map(item => item.trim())
    .filter(item => item.length > 0)
  return items && items.length > 0 ? items : undefined
}

function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function buildLibraryRootFromEnv(): Effect.Effect<string, LibraryError> {
  return Effect.sync(() => process.env.KORRI_LIBRARY_ROOT?.trim()).pipe(
    Effect.flatMap(root => {
      if (root && root.length > 0) return Effect.succeed(root)

      return Effect.try({
        try: () => korriDataPath(process.env, "library"),
        catch: () =>
          new LibraryError({
            reason: "config",
            message:
              "KORRI_LIBRARY_ROOT, XDG_DATA_HOME, or HOME is required when KORRI_LIBRARY_SOURCE is proseql",
            diagnostic:
              "Set KORRI_LIBRARY_ROOT to the configured Korri library directory, or provide XDG_DATA_HOME/HOME so Korri can use the XDG data root.",
          }),
      })
    }),
  )
}

function toLibraryError(error: unknown): LibraryError {
  if (error instanceof LibraryError) return error

  return new LibraryError({
    reason: "io",
    message: error instanceof Error ? error.message : String(error),
  })
}
