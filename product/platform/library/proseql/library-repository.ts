/**
 * Korri library repository — the seam between proseql collections and
 * the cascade-based launch resolution.
 *
 * Read methods:
 * - `listGames()` — every game in the library, sorted lastPlayed-desc
 *   with never-played games last (carry-over from the legacy
 *   repository's sort behavior).
 * - `resolveLaunchForGame(gameId, opts)` — loads the full
 *   `ConfigSnapshot` from the six collections, runs the cascade
 *   resolver, composes a `LaunchSpec`, and returns the spec plus the
 *   resolved gamescope policy. Two-output split because gamescope
 *   wraps the spec runner-side (it rides on the launch intent
 *   alongside, not inside, the LaunchSpec).
 *
 * Write methods (used by the importer + tests):
 * - `upsertGame`, `upsertGlobalConfig`, `upsertUser`, `upsertSystem`,
 *   `upsertLauncher`, `upsertCollection`
 * - `upsertImportedGame({ game, launcher, systemDelta })` —
 *   transactional: upserts the game, merges the launcher's supported
 *   systems list, merges the system delta's `cores` map.
 */

import { access } from "node:fs/promises"

import {
  type ArtifactImportMetadata,
  createArtifactImportService,
  createProseqlArtifactRepository,
} from "@platform/artifacts/artifact-import-service"
import { artifactBlobPath } from "@platform/artifacts/artifact-store"
import {
  resolveAppDescriptor,
  unknownSettingDiagnostics,
} from "@platform/library/config/app-integrations"
import { materializeAppLaunch } from "@platform/library/config/app-materializer"
import type { ConfigSnapshot } from "@platform/library/config/cascade-resolver"
import {
  resolveLaunchContext,
  resolveLocalLauncherGamescopePolicy,
} from "@platform/library/config/cascade-resolver"
import { composeLaunchSpec } from "@platform/library/config/compose-launch-spec"
import type { EphemeralOverride } from "@platform/library/config/ephemeral-override"
import type { CascadeError } from "@platform/library/config/errors"
import type { GamescopePolicy } from "@platform/library/config/inheritable-fields"
import { collectLayerLaunchDiagnostics } from "@platform/library/config/launch-block"
import type { AppRecord } from "@platform/library/config/records/app"
import type { CollectionRecord } from "@platform/library/config/records/collection"
import type { GameRecord } from "@platform/library/config/records/game"
import {
  GLOBAL_CONFIG_KEY,
  type GlobalConfigPayload,
  type GlobalConfigRecord,
} from "@platform/library/config/records/global"
import type { LauncherRecord } from "@platform/library/config/records/launcher"
import type { ModuleRecord } from "@platform/library/config/records/module"
import type { SystemRecord } from "@platform/library/config/records/system"
import type { UserRecord } from "@platform/library/config/records/user"
import type { ResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import type { LaunchSpec } from "@platform/library/launcher"
import { LibraryError } from "@platform/library/library-services"
import type { ArtifactRecord } from "@platform/protocol/artifact/artifact"
import { Effect } from "effect"
import type { KorriLibraryDb } from "./library-db"

export interface ResolveLaunchOptions {
  readonly userId?: string
  readonly presetId?: string
  readonly override?: EphemeralOverride
}

export interface ResolvedLaunchOutput {
  readonly spec: LaunchSpec
  readonly gamescope?: GamescopePolicy
  readonly app?: {
    readonly id: string
    readonly integration: string
  }
  readonly module?: {
    readonly id: string
    readonly path?: string
  }
  readonly settings?: Readonly<Record<string, string | number | boolean>>
  readonly content?: {
    readonly artifactId: string
  }
  readonly artifacts?: LaunchArtifacts
  readonly diagnostics?: readonly string[]
}

/**
 * Delta produced by the importer: a partial SystemRecord contribution
 * (must declare at least the system id, may declare cores per-launcher,
 * name, manufacturer).
 */
export interface SystemDelta {
  readonly id: string
  readonly name?: string
  readonly manufacturer?: string
  readonly cores?: Readonly<Record<string, string>>
}

export interface ImportedGameRecord {
  readonly game: GameRecord
  readonly launcher: LauncherRecord
  readonly systemDelta: SystemDelta
}

export type ArtifactAdoptionSource =
  | {
      readonly kind: "bytes"
      readonly bytes: Buffer | Uint8Array | string
    }
  | {
      readonly kind: "file"
      readonly sourcePath: string
    }

export interface ArtifactAdoptionLibraryOptions {
  readonly createGame?: boolean
  readonly gameId?: string
  readonly system?: string
  readonly title?: string
}

export interface AdoptArtifactInput {
  readonly source: ArtifactAdoptionSource
  readonly artifact: ArtifactImportMetadata
  readonly library?: ArtifactAdoptionLibraryOptions
}

export interface AdoptArtifactOutput {
  readonly artifact: ArtifactRecord
  readonly game?: GameRecord
}

export interface CreateLibraryRepositoryOptions {
  readonly env?: Record<string, string | undefined>
}

export interface LibraryRepository {
  readonly listGames: () => Effect.Effect<readonly GameRecord[], unknown>
  readonly upsertGame: (game: GameRecord) => Effect.Effect<GameRecord, unknown>
  readonly upsertGlobalConfig: (
    payload: GlobalConfigPayload,
  ) => Effect.Effect<GlobalConfigRecord, unknown>
  readonly upsertUser: (user: UserRecord) => Effect.Effect<UserRecord, unknown>
  readonly upsertSystem: (
    system: SystemRecord,
  ) => Effect.Effect<SystemRecord, unknown>
  readonly upsertLauncher: (
    launcher: LauncherRecord,
  ) => Effect.Effect<LauncherRecord, unknown>
  readonly upsertApp: (app: AppRecord) => Effect.Effect<AppRecord, unknown>
  readonly upsertModule: (
    module: ModuleRecord,
  ) => Effect.Effect<ModuleRecord, unknown>
  readonly upsertCollection: (
    collection: CollectionRecord,
  ) => Effect.Effect<CollectionRecord, unknown>
  readonly upsertImportedGame: (
    record: ImportedGameRecord,
  ) => Effect.Effect<void, unknown>
  readonly adoptArtifact: (
    input: AdoptArtifactInput,
  ) => Effect.Effect<AdoptArtifactOutput, LibraryError>
  readonly resolveLaunchForGame: (
    gameId: string,
    opts?: ResolveLaunchOptions,
  ) => Effect.Effect<ResolvedLaunchOutput, CascadeError | LibraryError>
  readonly resolveLocalLauncherGamescopePolicy: (
    launcherId: string,
    opts?: Pick<ResolveLaunchOptions, "override">,
  ) => Effect.Effect<GamescopePolicy, LibraryError>
}

export function createLibraryRepository(
  db: KorriLibraryDb,
  options: CreateLibraryRepositoryOptions = {},
): LibraryRepository {
  const env = options.env ?? process.env
  return {
    listGames: () =>
      Effect.promise(() => db.games.query().runPromise).pipe(
        Effect.map(records => [...records].sort(compareByLastPlayedDesc)),
      ),

    upsertGame: game =>
      db.games.upsert({
        where: { id: game.id },
        create: game,
        update: game,
      }),

    upsertGlobalConfig: payload =>
      db.config.upsert({
        where: { id: GLOBAL_CONFIG_KEY },
        create: { id: GLOBAL_CONFIG_KEY, ...payload },
        update: { id: GLOBAL_CONFIG_KEY, ...payload },
      }) as unknown as Effect.Effect<GlobalConfigRecord, unknown>,

    upsertUser: user =>
      db.users.upsert({
        where: { id: user.id },
        create: user,
        update: user,
      }),

    upsertSystem: system =>
      db.systems.upsert({
        where: { id: system.id },
        create: system,
        update: system,
      }),

    upsertLauncher: launcher =>
      db.launchers.upsert({
        where: { id: launcher.id },
        create: launcher,
        update: launcher,
      }),

    upsertApp: app =>
      db.apps.upsert({
        where: { id: app.id },
        create: app,
        update: app,
      }),

    upsertModule: module =>
      db.modules.upsert({
        where: { id: module.id },
        create: module,
        update: module,
      }),

    upsertCollection: collection =>
      db.collections.upsert({
        where: { id: collection.id },
        create: collection,
        update: collection,
      }),

    upsertImportedGame: record =>
      db.$transaction(tx =>
        Effect.gen(function* () {
          yield* tx.games.upsert({
            where: { id: record.game.id },
            create: record.game,
            update: record.game,
          })

          // Merge launcher: keep existing supported systems + new ones.
          const existingLauncher = yield* tryFindById(
            tx.launchers,
            record.launcher.id,
          )
          const mergedLauncher = mergeLauncherSystems(
            existingLauncher,
            record.launcher,
          )
          yield* tx.launchers.upsert({
            where: { id: mergedLauncher.id },
            create: mergedLauncher,
            update: mergedLauncher,
          })

          // Merge system: deep-merge the cores map, keep most-specific
          // non-empty fields.
          const existingSystem = yield* tryFindById(
            tx.systems,
            record.systemDelta.id,
          )
          const mergedSystem = mergeSystemDelta(
            existingSystem,
            record.systemDelta,
            record.launcher.id,
          )
          yield* tx.systems.upsert({
            where: { id: mergedSystem.id },
            create: mergedSystem,
            update: mergedSystem,
          })
        }),
      ),

    adoptArtifact: input => adoptArtifact(db, env, input),

    resolveLaunchForGame: (gameId, opts) =>
      Effect.gen(function* () {
        const snapshot = yield* loadSnapshot(db)
        const unresolvedContext = yield* resolveLaunchContext(snapshot, {
          gameId,
          userId: opts?.userId,
          presetId: opts?.presetId,
          override: opts?.override,
        })
        const context = yield* resolveArtifactBackedContent(
          db,
          env,
          unresolvedContext,
        )
        const app = yield* resolveAppDescriptor({
          appId: context.launcherId,
          apps: snapshot.apps,
          launchers: snapshot.launchers,
        })
        const materialized = yield* materializeAppLaunch({ app, context })
        const spec = yield* composeLaunchSpec(
          materialized.launcher,
          materialized.context,
        )
        const diagnostics = collectLaunchDiagnostics(snapshot, context)
        diagnostics.push(
          ...unknownSettingDiagnostics({ app, settings: context.settings }).map(
            key => `Unknown ${app.id} setting: ${key}`,
          ),
        )
        return {
          spec,
          ...(context.gamescope ? { gamescope: context.gamescope } : {}),
          app: { id: app.id, integration: app.integration },
          ...(context.moduleId
            ? { module: { id: context.moduleId, path: context.modulePath } }
            : {}),
          ...(context.settings ? { settings: context.settings } : {}),
          ...(context.content ? { content: context.content } : {}),
          ...(materialized.artifacts
            ? { artifacts: materialized.artifacts }
            : {}),
          ...(diagnostics.length > 0 ? { diagnostics } : {}),
        }
      }),

    resolveLocalLauncherGamescopePolicy: (launcherId, opts) =>
      Effect.gen(function* () {
        const snapshot = yield* loadSnapshot(db)
        return resolveLocalLauncherGamescopePolicy(snapshot, {
          launcherId,
          override: opts?.override,
        })
      }),
  }
}

function adoptArtifact(
  db: KorriLibraryDb,
  env: Record<string, string | undefined>,
  input: AdoptArtifactInput,
): Effect.Effect<AdoptArtifactOutput, LibraryError> {
  return Effect.gen(function* () {
    yield* validateArtifactAdoptionLibraryInput(input)
    const importService = createArtifactImportService({
      env,
      repository: createProseqlArtifactRepository(db),
    })
    const artifact = yield* Effect.tryPromise({
      try: () =>
        input.source.kind === "bytes"
          ? importService.importBytes({
              ...input.artifact,
              bytes: input.source.bytes,
            })
          : importService.importFile({
              ...input.artifact,
              sourcePath: input.source.sourcePath,
            }),
      catch: toLibraryError,
    })

    const game = yield* maybeCreateArtifactGame(db, artifact, input.library)
    return {
      artifact,
      ...(game ? { game } : {}),
    }
  })
}

function validateArtifactAdoptionLibraryInput(
  input: AdoptArtifactInput,
): Effect.Effect<void, LibraryError> {
  return resolveAdoptedGameSystem(input.artifact, input.library).pipe(
    Effect.asVoid,
  )
}

function resolveAdoptedGameSystem(
  artifact: Pick<ArtifactImportMetadata, "kind" | "system">,
  options: ArtifactAdoptionLibraryOptions | undefined,
): Effect.Effect<string | undefined, LibraryError> {
  if (artifact.kind !== "content" || options?.createGame !== true) {
    return Effect.succeed(undefined)
  }

  const system = options.system ?? artifact.system
  return system
    ? Effect.succeed(system)
    : Effect.fail(
        new LibraryError({
          reason: "config",
          message: "content artifact adoption requires a system",
        }),
      )
}

function maybeCreateArtifactGame(
  db: KorriLibraryDb,
  artifact: ArtifactRecord,
  options: ArtifactAdoptionLibraryOptions | undefined,
): Effect.Effect<GameRecord | undefined, LibraryError> {
  return Effect.gen(function* () {
    const system = yield* resolveAdoptedGameSystem(artifact, options)
    if (!system) return undefined

    const game: GameRecord = {
      id: options?.gameId ?? artifact.id,
      system,
      content: { artifactId: artifact.id },
      metadata: {
        name:
          options?.title ?? artifact.facets?.title?.text ?? artifact.file.name,
      },
    }

    return yield* db.games
      .upsert({ where: { id: game.id }, create: game, update: game })
      .pipe(
        Effect.flatMap(() =>
          Effect.tryPromise({ try: () => db.flush(), catch: toLibraryError }),
        ),
        Effect.as(game),
        Effect.mapError(toLibraryError),
      )
  })
}

function resolveArtifactBackedContent(
  db: KorriLibraryDb,
  env: Record<string, string | undefined>,
  context: ResolvedLaunchContext,
): Effect.Effect<ResolvedLaunchContext, LibraryError> {
  const artifactId = context.content?.artifactId
  if (!artifactId) return Effect.succeed(context)

  return Effect.tryPromise({
    try: async () => {
      const artifactRepository = createProseqlArtifactRepository(db)
      const artifact = await artifactRepository.findArtifactById(artifactId)
      if (!artifact) {
        throw new LibraryError({
          reason: "config",
          message: `artifact not found: ${artifactId}`,
        })
      }
      const contentPath = artifactBlobPath(env, artifact)
      try {
        await access(contentPath)
      } catch (error) {
        const code = (error as { readonly code?: string }).code
        throw new LibraryError({
          reason: "io",
          message:
            code === "ENOENT"
              ? `artifact blob missing from store: ${artifactId} expected at ${contentPath}`
              : `artifact blob unreadable${code ? ` (${code})` : ""}: ${contentPath}`,
        })
      }
      return {
        ...context,
        contentPath,
      }
    },
    catch: toLibraryError,
  })
}

function collectLaunchDiagnostics(
  snapshot: ConfigSnapshot,
  context: ResolvedLaunchContext,
): string[] {
  const diagnostics: string[] = []
  const pushLayer = (
    path: string,
    input: Parameters<typeof collectLayerLaunchDiagnostics>[1] | undefined,
  ) => {
    if (!input) return
    diagnostics.push(
      ...collectLayerLaunchDiagnostics(path, input).map(d => d.message),
    )
    for (const key of Object.keys(input.byLauncher ?? {})) {
      if (key !== context.launcherId) {
        diagnostics.push(
          `${path}.byLauncher.${key} does not match resolved app ${context.launcherId}`,
        )
      }
    }
  }

  pushLayer("config.global", snapshot.global ?? undefined)
  pushLayer(`systems.${context.system}`, snapshot.systems.get(context.system))
  pushLayer(`games.${context.gameId}`, snapshot.games.get(context.gameId))
  return diagnostics
}

/**
 * Load every collection into an in-memory `ConfigSnapshot` ready to feed
 * the cascade resolver. Mirrors the six declared collections; the
 * singleton config is folded into `snapshot.global`.
 */
function loadSnapshot(
  db: KorriLibraryDb,
): Effect.Effect<ConfigSnapshot, LibraryError> {
  return Effect.gen(function* () {
    const [
      configRows,
      users,
      systems,
      launchers,
      apps,
      modules,
      games,
      collections,
    ] = yield* Effect.all(
      [
        Effect.tryPromise({
          try: () => db.config.query().runPromise,
          catch: toLibraryError,
        }),
        Effect.tryPromise({
          try: () => db.users.query().runPromise,
          catch: toLibraryError,
        }),
        Effect.tryPromise({
          try: () => db.systems.query().runPromise,
          catch: toLibraryError,
        }),
        Effect.tryPromise({
          try: () => db.launchers.query().runPromise,
          catch: toLibraryError,
        }),
        Effect.tryPromise({
          try: () => db.apps.query().runPromise,
          catch: toLibraryError,
        }),
        Effect.tryPromise({
          try: () => db.modules.query().runPromise,
          catch: toLibraryError,
        }),
        Effect.tryPromise({
          try: () => db.games.query().runPromise,
          catch: toLibraryError,
        }),
        Effect.tryPromise({
          try: () => db.collections.query().runPromise,
          catch: toLibraryError,
        }),
      ],
      { concurrency: "unbounded" },
    )

    const global = configRows.find(r => r.id === GLOBAL_CONFIG_KEY) ?? null

    return {
      global: global as GlobalConfigRecord | null,
      users: new Map(users.map(u => [u.id, u])),
      systems: new Map(systems.map(s => [s.id, s])),
      launchers: new Map(launchers.map(l => [l.id, l])),
      apps: new Map(apps.map(a => [a.id, a])),
      modules: new Map(modules.map(m => [m.id, m])),
      games: new Map(games.map(g => [g.id, g])),
      collections: new Map(collections.map(c => [c.id, c])),
    }
  })
}

/** Returns the record or `undefined` if `findById` raises NotFoundError. */
function tryFindById<T>(
  collection: { findById: (id: string) => Effect.Effect<T, unknown> },
  id: string,
): Effect.Effect<T | undefined, never> {
  return collection.findById(id).pipe(
    Effect.match({
      onSuccess: (record: T) => record,
      onFailure: () => undefined,
    }),
  )
}

function mergeLauncherSystems(
  prev: LauncherRecord | undefined,
  incoming: LauncherRecord,
): LauncherRecord {
  if (!prev) return incoming
  const seen = new Set([...prev.systems, ...incoming.systems])
  return { ...prev, ...incoming, systems: [...seen] }
}

function mergeSystemDelta(
  prev: SystemRecord | undefined,
  delta: SystemDelta,
  defaultLauncher: string,
): SystemRecord {
  const mergedCores = { ...(prev?.cores ?? {}), ...(delta.cores ?? {}) }
  return {
    ...(prev ?? { id: delta.id }),
    id: delta.id,
    launcher: prev?.launcher ?? defaultLauncher,
    ...(delta.name !== undefined ? { name: delta.name } : {}),
    ...(delta.manufacturer !== undefined
      ? { manufacturer: delta.manufacturer }
      : {}),
    ...(Object.keys(mergedCores).length > 0 ? { cores: mergedCores } : {}),
  }
}

function toLibraryError(error: unknown): LibraryError {
  if (error instanceof LibraryError) return error
  return new LibraryError({
    reason: "io",
    message: error instanceof Error ? error.message : String(error),
  })
}

function compareByLastPlayedDesc(a: GameRecord, b: GameRecord): number {
  const ta = a.userData?.lastPlayed
  const tb = b.userData?.lastPlayed
  const tt = (x: typeof ta) =>
    x instanceof Date
      ? x.getTime()
      : typeof x === "string"
        ? Date.parse(x)
        : undefined
  const an = tt(ta)
  const bn = tt(tb)
  if (an === undefined && bn === undefined) return 0
  if (an === undefined) return 1
  if (bn === undefined) return -1
  return bn - an
}
