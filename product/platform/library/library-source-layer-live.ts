import { korriDataPath } from "@platform/config/xdg-paths"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { logger } from "@platform/logger"
import { Effect, Layer } from "effect"
import {
  LibraryError,
  LibrarySource,
  type LibrarySourceService,
} from "./library-services"
import type { LibrarySource as PlainLibrarySource } from "./library-source"
import {
  type KorriConfigGraphRoot,
  openKorriConfigGraph,
} from "./proseql/library-db"
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
        : withLibraryRepository(
            repository =>
              repository
                .listPlayableEntries()
                .pipe(Effect.map(entries => entries.map(toCompatGameRecord))),
            "list",
          ),
    listPlayableEntries: () =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(
            source =>
              source.list().then(games => games.map(compatGameToPlayableEntry)),
            "listPlayableEntries",
          )
        : withLibraryRepository(
            repository => repository.listPlayableEntries(),
            "listPlayableEntries",
          ),
    launchSpecFor: (id, releaseId) =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(source => source.launchSpecFor(id), "launchSpecFor")
        : withLibraryRepository(
            repository =>
              repository
                .resolveLaunchForPlayable(id, { releaseId })
                .pipe(Effect.map(resolved => resolved.spec)),
            "launchSpecFor",
          ).pipe(
            Effect.matchEffect({
              onSuccess: spec => Effect.succeed(spec),
              onFailure: (error: LibraryError) =>
                error.reason === "config"
                  ? Effect.succeed(undefined)
                  : Effect.fail(error),
            }),
          ),
    canResolveLaunchForGame: (id, inputs) =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(
            source =>
              source.canResolveLaunchForGame
                ? source.canResolveLaunchForGame(id, inputs)
                : source.launchSpecFor(id).then(spec => spec !== undefined),
            "canResolveLaunchForGame",
          )
        : withLibraryRepository(
            repository => repository.canResolveLaunchForPlayable(id, inputs),
            "canResolveLaunchForGame",
          ),
    resolveLaunchForGame: (id, inputs) =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(
            source => source.resolveLaunchForGame(id, inputs),
            "resolveLaunchForGame",
          )
        : withLibraryRepository(
            repository => repository.resolveLaunchForPlayable(id, inputs),
            "resolveLaunchForGame",
          ),
    resolveLocalLauncherPolicy: (launcherId, inputs) =>
      withLibraryRepository(
        repository => repository.resolveLocalLauncherPolicy(launcherId, inputs),
        "resolveLocalLauncherPolicy",
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
      const roots = configGraphRootsFromEnv()
      logger.info(
        {
          sourceKind: "proseql",
          operation,
          roots: roots.map(root => root.root),
        },
        "library-source-layer-live: opening Korri config graph",
      )
      const db = yield* openKorriConfigGraph({ roots })
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

/**
 * Resolve ordered Korri config-graph roots from the runtime environment.
 *
 * `KORRI_CONFIG_ROOTS` is the public contract: a colon-separated, ordered list
 * of config-root directories (earlier roots are overlaid first, later roots
 * win). An explicitly empty value yields an empty graph. When the variable is
 * unset, Korri falls back to the XDG-derived config directory as a single
 * optional dev root; when even that cannot be derived, the empty baseline graph
 * is used. The legacy `KORRI_LIBRARY_ROOT` is intentionally not consulted.
 */
export function configGraphRootsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): readonly KorriConfigGraphRoot[] {
  const explicit = parseListEnv(env.KORRI_CONFIG_ROOTS)
  if (explicit) return explicit.map(root => ({ root }))
  if (env.KORRI_CONFIG_ROOTS !== undefined) return []

  try {
    return [{ root: korriDataPath(env, "config") }]
  } catch {
    return []
  }
}

function toLibraryError(error: unknown): LibraryError {
  if (error instanceof LibraryError) return error

  return new LibraryError({
    reason: "io",
    message: error instanceof Error ? error.message : String(error),
  })
}

function toCompatGameRecord(entry: PlayableLibraryEntry): ResolvedGameRecord {
  const release = entry.releases[0]
  return {
    id: entry.id,
    system: release?.system ?? "unknown",
    metadata: { name: entry.title ?? entry.id },
  }
}

function compatGameToPlayableEntry(
  game: ResolvedGameRecord,
): PlayableLibraryEntry {
  return {
    id: game.id,
    itemId: game.id,
    title: game.metadata?.name ?? game.id,
    releases: [
      {
        id: "default",
        system: game.system,
        launchable:
          game.contentPath !== undefined || game.content !== undefined,
        ...(game.contentPath !== undefined ? { target: game.contentPath } : {}),
      },
    ],
    launchable: game.contentPath !== undefined || game.content !== undefined,
    metadata: game.metadata,
    ...(game.media !== undefined ? { media: game.media } : {}),
  }
}
