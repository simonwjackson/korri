import { korriDataPath } from "@shared/config/xdg-paths"
import type { LaunchSpec } from "@shared/library/launcher"
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
            repository =>
              repository.resolveLaunchForGame(id).pipe(
                Effect.matchEffect({
                  onSuccess: out =>
                    Effect.succeed(out.spec as LaunchSpec | undefined),
                  onFailure: error =>
                    "_tag" in error && error._tag === "GameNotFound"
                      ? Effect.succeed(undefined as LaunchSpec | undefined)
                      : Effect.fail(
                          new LibraryError({
                            reason: "config",
                            message: cascadeErrorMessage(error),
                          }),
                        ),
                }),
              ),
            "launchSpecFor",
          ),
    resolveLaunchForGame: (id, inputs) =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(
            source => source.resolveLaunchForGame(id, inputs),
            "resolveLaunchForGame",
          )
        : withLibraryRepository(
            repository =>
              repository.resolveLaunchForGame(id, inputs).pipe(
                Effect.mapError(
                  error =>
                    new LibraryError({
                      reason: "config",
                      message: cascadeErrorMessage(error),
                    }),
                ),
              ),
            "resolveLaunchForGame",
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

function cascadeErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "_tag" in error) {
    const tag = (error as { _tag: string })._tag
    if (tag === "GameNotFound") return "GameNotFound"
    if (tag === "LauncherUnresolvable")
      return "missing launcher profile for game"
    if (tag === "CoreNotConfigured") return "missing required core for game"
    if (tag === "PresetNotFound") return "unknown preset for game"
    if (tag === "UserNotFound") return "unknown user"
    if (tag === "MissingRequiredValue")
      return "launch template references missing value"
    if (tag === "UnresolvedPlaceholder")
      return "launch template references an unsupported placeholder"
    if (tag === "DisallowedCommand") return "launch command not allowed"
    return `cascade error: ${tag}`
  }
  return error instanceof Error ? error.message : String(error)
}

function toLibraryError(error: unknown): LibraryError {
  if (error instanceof LibraryError) return error

  return new LibraryError({
    reason: "io",
    message: error instanceof Error ? error.message : String(error),
  })
}
