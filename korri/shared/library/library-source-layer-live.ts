import { logger } from "@shared/logger"
import { Effect, Layer } from "effect"
import type { LibrarySource as PlainLibrarySource } from "./library-source"
import {
  LibraryError,
  LibrarySource,
  type LibrarySourceService,
} from "./library-services"
import { openKorriLibraryDb } from "./proseql/library-db"
import {
  createLibraryRepository,
  type LibraryRepository,
} from "./proseql/library-repository"
import {
  createRocknixSource,
  defaultRocknixConfig,
  type RocknixConfig,
} from "./rocknix/rocknix-source"

const DEFAULT_LIBRARY_ROOT = "/storage/korri/library"

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
  const config = buildRocknixConfigFromEnv()
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
}

function withLibraryRepository<T>(
  useRepository: (repository: LibraryRepository) => Effect.Effect<T, unknown>,
  operation: string,
): Effect.Effect<T, LibraryError> {
  return Effect.scoped(
    Effect.gen(function* () {
      const root = buildLibraryRootFromEnv()
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

  // The Odin package runs inside the ROCKNIX guest, where the persistent
  // source of truth is `/storage/roms/*/gamelist.xml` rather than Korri's
  // optional ProseQL import cache.
  if (process.env.KORRI_DESKTOP_PROFILE === "odin") return "rocknix"

  return "proseql"
}

function buildRocknixConfigFromEnv(): RocknixConfig {
  const defaults = defaultRocknixConfig()

  return {
    ...defaults,
    gamelistRoots:
      parseListEnv(process.env.KORRI_ROCKNIX_GAMELIST_ROOTS) ??
      defaults.gamelistRoots,
    esSystemsPath:
      optionalEnv(process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH) ??
      defaults.esSystemsPath,
    launchCommand:
      optionalEnv(process.env.KORRI_ROCKNIX_LAUNCH_COMMAND) ??
      defaults.launchCommand,
    mediaRoot:
      optionalEnv(process.env.KORRI_ROCKNIX_MEDIA_ROOT) ?? defaults.mediaRoot,
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

function buildLibraryRootFromEnv(): string {
  const rootRaw = process.env.KORRI_LIBRARY_ROOT
  return rootRaw && rootRaw.trim() !== ""
    ? rootRaw.trim()
    : DEFAULT_LIBRARY_ROOT
}

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "io",
    message: error instanceof Error ? error.message : String(error),
  })
}
