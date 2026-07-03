import { readdirSync, readFileSync, realpathSync } from "node:fs"
import { join, relative } from "node:path"
import { korriDataPath } from "@platform/config/xdg-paths"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { logger } from "@platform/logger"
import { Effect, Layer } from "effect"
import type { ConfigGraphController } from "./config-graph-controller"
import {
  LibraryError,
  LibrarySource,
  type LibrarySourceService,
} from "./library-services"
import type { LibrarySource as PlainLibrarySource } from "./library-source"
import {
  type KorriConfigGraphRoot,
  openKorriConfigGraph,
  REMOVABLE_CONFIG_COLLECTIONS,
} from "./proseql/config-graph-db"
import {
  type CreateLibraryRepositoryOptions,
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

export interface LiveLibrarySourceServiceOptions {
  readonly repositoryOptions?: CreateLibraryRepositoryOptions
}

export function createLiveLibrarySourceService(
  options: LiveLibrarySourceServiceOptions = {},
): LibrarySourceService {
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
            options.repositoryOptions,
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
            options.repositoryOptions,
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
            options.repositoryOptions,
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
            options.repositoryOptions,
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
            options.repositoryOptions,
          ),
    resolveLocalLauncherPolicy: (launcherId, inputs) =>
      withLibraryRepository(
        repository => repository.resolveLocalLauncherPolicy(launcherId, inputs),
        "resolveLocalLauncherPolicy",
        options.repositoryOptions,
      ),
  }
}

export interface ControllerBackedLibrarySourceServiceOptions
  extends LiveLibrarySourceServiceOptions {
  readonly controller: ConfigGraphController
}

export function createControllerBackedLibrarySourceService(
  options: ControllerBackedLibrarySourceServiceOptions,
): LibrarySourceService {
  const { controller, repositoryOptions } = options
  return {
    list: () =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(source => source.list(), "list")
        : withControllerRepository(
            controller,
            repository =>
              repository
                .listPlayableEntries()
                .pipe(Effect.map(entries => entries.map(toCompatGameRecord))),
            repositoryOptions,
          ),
    listPlayableEntries: () =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(
            source =>
              source.list().then(games => games.map(compatGameToPlayableEntry)),
            "listPlayableEntries",
          )
        : withControllerRepository(
            controller,
            repository => repository.listPlayableEntries(),
            repositoryOptions,
          ),
    launchSpecFor: (id, releaseId) =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(source => source.launchSpecFor(id), "launchSpecFor")
        : withControllerRepository(
            controller,
            repository =>
              repository
                .resolveLaunchForPlayable(id, { releaseId })
                .pipe(Effect.map(resolved => resolved.spec)),
            repositoryOptions,
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
        : withControllerRepository(
            controller,
            repository => repository.canResolveLaunchForPlayable(id, inputs),
            repositoryOptions,
          ),
    resolveLaunchForGame: (id, inputs) =>
      selectedLibrarySourceMode() === "rocknix"
        ? withRocknixSource(
            source => source.resolveLaunchForGame(id, inputs),
            "resolveLaunchForGame",
          )
        : withControllerRepository(
            controller,
            repository => repository.resolveLaunchForPlayable(id, inputs),
            repositoryOptions,
          ),
    resolveLocalLauncherPolicy: (launcherId, inputs) =>
      withControllerRepository(
        controller,
        repository => repository.resolveLocalLauncherPolicy(launcherId, inputs),
        repositoryOptions,
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
  repositoryOptions: CreateLibraryRepositoryOptions | undefined = undefined,
): Effect.Effect<T, LibraryError> {
  return Effect.scoped(
    Effect.gen(function* () {
      const roots = resolveAllConfigGraphRoots()
      logger.info(
        {
          sourceKind: "proseql",
          operation,
          roots: roots.map(root => root.root),
        },
        "library-source-layer-live: opening Korri config graph",
      )
      const db = yield* openKorriConfigGraph({ roots })
      return yield* useRepository(
        createLibraryRepository(db, repositoryOptions),
      )
    }),
  ).pipe(Effect.mapError(toLibraryError))
}

function withControllerRepository<T>(
  controller: ConfigGraphController,
  useRepository: (repository: LibraryRepository) => Effect.Effect<T, unknown>,
  repositoryOptions: CreateLibraryRepositoryOptions | undefined = undefined,
): Effect.Effect<T, LibraryError> {
  return controller
    .withActiveDb(db =>
      useRepository(createLibraryRepository(db, repositoryOptions)),
    )
    .pipe(Effect.mapError(toLibraryError))
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

export interface ResolveConfigGraphRootsOptions {
  /**
   * Mount table consulted to validate signal-dir entries against live
   * mounts. Defaults to `/proc/mounts`; tests point it at a real file they
   * seeded.
   */
  readonly mountsTablePath?: string
  /**
   * Root under which Korri mounts removable media. Dynamic signal-dir entries
   * must resolve below this boundary and below a live mount under it.
   */
  readonly removableMediaRoot?: string
}

const DEFAULT_MOUNTS_TABLE_PATH = "/proc/mounts"
const DEFAULT_REMOVABLE_MEDIA_ROOT = "/run/media/korri"

/** Decode the octal escapes (`\040` …) /proc/mounts uses in path fields. */
function decodeMountField(field: string): string {
  return field.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  )
}

function readMountTable(path: string): ReadonlyMap<string, string> | undefined {
  try {
    const table = new Map<string, string>()
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const fields = line.split(" ")
      const target = fields[1]
      const mountOptions = fields[3]
      if (target === undefined || mountOptions === undefined) continue
      table.set(decodeMountField(target), mountOptions)
    }
    return table
  } catch {
    return undefined
  }
}

function isPathAtOrUnder(parent: string, child: string): boolean {
  const relation = relative(parent, child)
  return relation === "" || (!relation.startsWith("..") && relation !== "..")
}

function isPathUnder(parent: string, child: string): boolean {
  const relation = relative(parent, child)
  return relation !== "" && !relation.startsWith("..") && relation !== ".."
}

function realpathOrUndefined(path: string): string | undefined {
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}

function owningRemovableMountOptions(
  target: string,
  mediaRoot: string,
  mounts: ReadonlyMap<string, string>,
): string | undefined {
  let selected: { readonly mount: string; readonly options: string } | undefined
  for (const [mount, options] of mounts) {
    const realMount = realpathOrUndefined(mount)
    if (realMount === undefined) continue
    if (!isPathUnder(mediaRoot, realMount)) continue
    if (!isPathUnder(realMount, target)) continue
    if (selected === undefined || realMount.length > selected.mount.length) {
      selected = { mount: realMount, options }
    }
  }
  return selected?.options
}

/**
 * Resolve dynamic removable-media config roots from the `config-roots.d`
 * signal directory (`KORRI_CONFIG_ROOTS_DIR`).
 *
 * Entries are symlinks named after the partition's filesystem UUID (the
 * media id); they resolve in sorted name order so multiple simultaneous
 * cards overlay deterministically (later-sorted card wins) and keep the
 * same identity across slots and re-inserts. Each entry's resolved target must be a live
 * mount in the mount table — stale or injected symlinks that are not mounts
 * are ignored, and an unreadable mount table contributes no dynamic roots
 * (fail-safe). Resolved roots are optional (they may vanish), carry a RW/RO
 * `writable` classification for the deferred authoring seam, and are
 * restricted to data collections so a card cannot override
 * execution-privileged config.
 */
export function removableConfigGraphRootsFromSignalDir(
  env: NodeJS.ProcessEnv = process.env,
  options: ResolveConfigGraphRootsOptions = {},
): readonly KorriConfigGraphRoot[] {
  const signalDir = optionalEnv(env.KORRI_CONFIG_ROOTS_DIR)
  if (signalDir === undefined) return []

  let entries: readonly string[]
  try {
    entries = [...readdirSync(signalDir)].sort()
  } catch {
    // Missing signal dir means no removable media support on this host.
    return []
  }
  if (entries.length === 0) return []

  const mounts = readMountTable(
    options.mountsTablePath ?? DEFAULT_MOUNTS_TABLE_PATH,
  )
  if (mounts === undefined) {
    logger.warn(
      { signalDir },
      "library-source-layer-live: mount table unreadable; ignoring removable config roots",
    )
    return []
  }

  const mediaRootPath =
    options.removableMediaRoot ??
    optionalEnv(env.KORRI_REMOVABLE_MEDIA_ROOT) ??
    DEFAULT_REMOVABLE_MEDIA_ROOT
  const mediaRoot = realpathOrUndefined(mediaRootPath)
  if (mediaRoot === undefined) {
    logger.warn(
      { signalDir, mediaRoot: mediaRootPath },
      "library-source-layer-live: removable media root unreadable; ignoring removable config roots",
    )
    return []
  }

  const roots: KorriConfigGraphRoot[] = []
  for (const entry of entries) {
    let target: string
    try {
      target = realpathSync(join(signalDir, entry))
    } catch {
      logger.warn(
        { signalDir, entry },
        "library-source-layer-live: skipping dangling config-root entry",
      )
      continue
    }
    if (!isPathAtOrUnder(mediaRoot, target)) {
      logger.warn(
        { signalDir, entry, target, mediaRoot },
        "library-source-layer-live: skipping config-root entry outside removable media root",
      )
      continue
    }
    const mountOptions = owningRemovableMountOptions(target, mediaRoot, mounts)
    if (mountOptions === undefined) {
      logger.warn(
        { signalDir, entry, target, mediaRoot },
        "library-source-layer-live: skipping config-root entry that is not under a live removable mount",
      )
      continue
    }
    roots.push({
      root: target,
      id: `removable-${entry}`,
      optional: true,
      writable: mountOptions === "rw" || mountOptions.startsWith("rw,"),
      collections: REMOVABLE_CONFIG_COLLECTIONS,
    })
  }
  return roots
}

/**
 * The full effective ordered config-graph root list: static base roots
 * (`KORRI_CONFIG_ROOTS`: platform defaults → local root → operator roots)
 * followed by dynamic removable roots (card-wins within their allowed
 * collections).
 */
export function resolveAllConfigGraphRoots(
  env: NodeJS.ProcessEnv = process.env,
  options: ResolveConfigGraphRootsOptions = {},
): readonly KorriConfigGraphRoot[] {
  return [
    ...configGraphRootsFromEnv(env),
    ...removableConfigGraphRootsFromSignalDir(env, options),
  ]
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
    ...(entry.playStats ? { playStats: entry.playStats } : {}),
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
        ...(game.contentPath !== undefined
          ? {
              target: {
                kind: "file" as const,
                storage: "legacy",
                path: game.contentPath,
              },
            }
          : {}),
      },
    ],
    launchable: game.contentPath !== undefined || game.content !== undefined,
    metadata: game.metadata,
    ...(game.playStats ? { playStats: game.playStats } : {}),
    ...(game.media !== undefined ? { media: game.media } : {}),
  }
}
