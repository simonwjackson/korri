import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { relative, sep } from "node:path"
import {
  createArtifactImportService,
  createProseqlArtifactRepository,
} from "@platform/artifacts/artifact-import-service"
import { artifactsRoot } from "@platform/artifacts/artifact-store"
import { installMetadataForRelease } from "@platform/library/config/app-install-metadata"
import type { AppIntegrationKind } from "@platform/library/config/app-integrations"
import {
  type ReadableConfigSnapshot,
  type ResolvedLocalLauncherPolicy,
  resolveReadableLaunchContext,
  resolveReadableLocalLauncherPolicy,
} from "@platform/library/config/cascade-resolver"
import { composeReadableLaunchSpec } from "@platform/library/config/compose-launch-spec"
import type { EphemeralOverride } from "@platform/library/config/ephemeral-override"
import type { ResolutionError } from "@platform/library/config/errors"
import {
  type LaunchCompanionMap,
  launchCompanionsFromLaunch,
  type MoonlightPolicy,
} from "@platform/library/config/inheritable-fields"
import {
  listPlayableEntries as derivePlayableEntries,
  launchableReleases,
  type PlayableEntry,
  splitPlayableId,
} from "@platform/library/config/playable-id"
import {
  type AppRecord,
  appRecordKind,
  decodeAppRecord,
} from "@platform/library/config/records/app"
import type { CollectionRecord } from "@platform/library/config/records/collection"
import type { GameRecord } from "@platform/library/config/records/game"
import type { GameAssetRecord } from "@platform/library/config/records/game-asset"
import type { GameAssetAssignmentRecord } from "@platform/library/config/records/game-asset-assignment"
import type { LauncherRecord } from "@platform/library/config/records/launcher"
import type { LibraryItemRecord } from "@platform/library/config/records/library-item"
import type { ModuleRecord } from "@platform/library/config/records/module"
import type { ProfileRecord } from "@platform/library/config/records/profile"
import {
  decodeProviderRecord,
  type ProviderRecord,
} from "@platform/library/config/records/provider"
import type { ProviderLinkRecord } from "@platform/library/config/records/provider-link"
import {
  decodeRuntimeRecord,
  type RuntimeRecord,
} from "@platform/library/config/records/runtime"
import type { SourceRecord } from "@platform/library/config/records/source"
import type { StorageRecord } from "@platform/library/config/records/storage"
import {
  decodeSystemRecord,
  type SystemRecord,
} from "@platform/library/config/records/system"
import type { UserRecord } from "@platform/library/config/records/user"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import { resolveReleaseTarget } from "@platform/library/config/source-target-resolution"
import { defaultReleaseContentIdentityResolver } from "@platform/library/content-identity/release-content-identity"
import { gameAssetBlobPath } from "@platform/library/game-assets/game-assets-service"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import type { LaunchSpec } from "@platform/library/launcher"
import { LibraryError } from "@platform/library/library-services"
import type {
  PlayableLibraryEntry,
  PlayableReleaseEntry,
} from "@platform/library/playable-library"
import type { ConfigRecordMap, PluginId } from "@platform/plugin"
import { isProviderId } from "@platform/plugin/ids"
import type { LaunchMetadata } from "@platform/plugin/launch-metadata"
import type { LaunchPrepareMap } from "@platform/plugin/launch-prepare"
import type { PluginRegistry } from "@platform/plugin/registry"
import type { ArtifactRecord } from "@platform/protocol/artifact/artifact"
import { Effect } from "effect"
import { type KorriLibraryDb, LOCAL_HOST_KEY } from "./library-db"

export interface ResolveLaunchOptions {
  readonly releaseId?: string
  readonly appId?: string
  readonly userId?: string
  readonly profileId?: string
  /** @deprecated old profile vocabulary; accepted as a temporary caller shim. */
  readonly presetId?: string
  readonly override?: EphemeralOverride
}

export interface ResolvedLaunchOutput {
  readonly spec: LaunchSpec
  readonly launchCompanions?: LaunchCompanionMap
  readonly launchMetadata?: LaunchMetadata
  readonly moonlight?: MoonlightPolicy
  readonly app: {
    readonly id: string
    readonly integration: AppIntegrationKind
  }
  readonly runtime?: {
    readonly id: string
    readonly path?: string
  }
  readonly playable: {
    readonly id: string
    readonly itemId: string
    readonly containedId?: string
    readonly title?: string
  }
  readonly release: PlayableReleaseEntry
  readonly content?: {
    readonly path?: string
  }
  readonly module?: {
    readonly id: string
    readonly path?: string
  }
  readonly settings?: Readonly<Record<string, string | number | boolean>>
  readonly artifacts?: LaunchArtifacts
  readonly diagnostics?: readonly string[]
}

/** @deprecated legacy importer delta retained only for follow-up realignment. */
export interface SystemDelta {
  readonly id: string
  readonly name?: string
  readonly manufacturer?: string
  readonly cores?: Readonly<Record<string, string>>
}

/** @deprecated legacy importer record retained only for follow-up realignment. */
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
  readonly artifact: unknown
  readonly library?: ArtifactAdoptionLibraryOptions
}

export interface AdoptArtifactOutput {
  readonly artifact: ArtifactRecord
  readonly game?: GameRecord
}

export interface ReadableLaunchMaterializationOptions {
  readonly env?: Record<string, string | undefined>
}

export interface ReadableLaunchIntegration {
  readonly providerId?: PluginId
  readonly kind: string
  readonly integration: AppIntegrationKind
  readonly canResolve: (context: ReadableResolvedLaunchContext) => boolean
  readonly materialize: (
    context: ReadableResolvedLaunchContext,
    options?: ReadableLaunchMaterializationOptions,
  ) => Effect.Effect<
    {
      readonly spec: LaunchSpec
      readonly launchMetadata?: LaunchMetadata
      readonly launchPrepare?: LaunchPrepareMap
      readonly artifacts?: LaunchArtifacts
      readonly diagnostics?: readonly string[]
    },
    ResolutionError
  >
}

export interface CreateLibraryRepositoryOptions {
  readonly env?: Record<string, string | undefined>
  readonly launchIntegrations?: readonly ReadableLaunchIntegration[]
  readonly pluginRegistry?: PluginRegistry
}

export interface LibraryRepository {
  readonly listPlayableEntries: () => Effect.Effect<
    readonly PlayableLibraryEntry[],
    LibraryError
  >
  readonly upsertLibraryItem: (
    item: LibraryItemRecord,
  ) => Effect.Effect<LibraryItemRecord, LibraryError>
  readonly upsertStorage: (
    storage: StorageRecord,
  ) => Effect.Effect<StorageRecord, LibraryError>
  readonly upsertProvider: (
    provider: ProviderRecord,
  ) => Effect.Effect<ProviderRecord, LibraryError>
  readonly upsertProviderLink: (
    providerLink: ProviderLinkRecord,
  ) => Effect.Effect<ProviderLinkRecord, LibraryError>
  /** @deprecated source records were removed; use upsertProvider/provider-links. */
  readonly upsertSource: (
    source: SourceRecord,
  ) => Effect.Effect<SourceRecord, LibraryError>
  readonly upsertSystem: (
    system: SystemRecord,
  ) => Effect.Effect<SystemRecord, LibraryError>
  readonly upsertApp: (app: AppRecord) => Effect.Effect<AppRecord, LibraryError>
  readonly upsertRuntime: (
    runtime: RuntimeRecord,
  ) => Effect.Effect<RuntimeRecord, LibraryError>
  readonly upsertProfile: (
    profile: ProfileRecord,
  ) => Effect.Effect<ProfileRecord, LibraryError>
  readonly upsertUser: (
    user: UserRecord,
  ) => Effect.Effect<UserRecord, LibraryError>
  readonly upsertCollection: (
    collection: CollectionRecord,
  ) => Effect.Effect<CollectionRecord, LibraryError>
  readonly canResolveLaunchForPlayable: (
    playableId: string,
    opts?: ResolveLaunchOptions,
  ) => Effect.Effect<boolean, LibraryError>
  readonly resolveLaunchForPlayable: (
    playableId: string,
    opts?: ResolveLaunchOptions,
  ) => Effect.Effect<ResolvedLaunchOutput, LibraryError>
  readonly asLibrarySource: () => {
    readonly list: () => Promise<readonly PlayableLibraryEntry[]>
    readonly launchSpecFor: (
      id: string,
      releaseId?: string,
    ) => Promise<LaunchSpec | undefined>
    readonly canResolveLaunchForGame: (
      id: string,
      inputs?: ResolveLaunchOptions,
    ) => Promise<boolean>
    readonly resolveLaunchForGame: (
      id: string,
      inputs?: ResolveLaunchOptions,
    ) => Promise<ResolvedLaunchOutput>
  }

  /** @deprecated use listPlayableEntries. */
  readonly listGames: () => Effect.Effect<readonly GameRecord[], LibraryError>
  /** @deprecated use upsertLibraryItem with release-shaped records. */
  readonly upsertGame: (
    game: GameRecord,
  ) => Effect.Effect<GameRecord, LibraryError>
  /** @deprecated legacy schema removed. */
  readonly upsertGlobalConfig: (
    payload: unknown,
  ) => Effect.Effect<unknown, LibraryError>
  /** @deprecated legacy schema removed. */
  readonly upsertLauncher: (
    launcher: LauncherRecord,
  ) => Effect.Effect<LauncherRecord, LibraryError>
  /** @deprecated legacy schema removed. */
  readonly upsertModule: (
    module: ModuleRecord,
  ) => Effect.Effect<ModuleRecord, LibraryError>
  /** @deprecated legacy importer path removed. */
  readonly upsertImportedGame: (
    record: ImportedGameRecord,
  ) => Effect.Effect<void, LibraryError>
  /** @deprecated legacy artifact adoption path removed from repository launch API. */
  readonly adoptArtifact: (
    input: AdoptArtifactInput,
  ) => Effect.Effect<AdoptArtifactOutput, LibraryError>
  /** @deprecated use canResolveLaunchForPlayable. */
  readonly canResolveLaunchForGame: (
    gameId: string,
    opts?: ResolveLaunchOptions,
  ) => Effect.Effect<boolean, LibraryError>
  /** @deprecated use resolveLaunchForPlayable. */
  readonly resolveLaunchForGame: (
    gameId: string,
    opts?: ResolveLaunchOptions,
  ) => Effect.Effect<ResolvedLaunchOutput, LibraryError>
  readonly resolveLocalLauncherPolicy: (
    launcherId: string,
    opts?: Pick<ResolveLaunchOptions, "override">,
  ) => Effect.Effect<ResolvedLocalLauncherPolicy, LibraryError>
  readonly resolveLocalLauncherCompanionPolicy: (
    launcherId: string,
    opts?: Pick<ResolveLaunchOptions, "override">,
  ) => Effect.Effect<LaunchCompanionMap, LibraryError>
}

export function createLibraryRepository(
  db: KorriLibraryDb,
  _options: CreateLibraryRepositoryOptions = {},
): LibraryRepository {
  const repository: LibraryRepository = {
    listPlayableEntries: () =>
      loadReadableSnapshot(db, _options).pipe(
        Effect.flatMap(snapshot =>
          hydrateReleaseIdentityTags(
            derivePlayableEntries([...snapshot.library.values()]).map(entry =>
              toPlayableLibraryEntry(entry, snapshot.readableLaunchers),
            ),
            snapshot.storage,
          ),
        ),
        Effect.flatMap(entries =>
          hydratePlayableMedia(db, entries, _options.env ?? process.env),
        ),
      ),

    upsertLibraryItem: item => upsert(db.library, item),
    upsertStorage: storage => upsert(db.storage, storage),
    upsertProvider: provider => upsert(db.providers, provider),
    upsertProviderLink: providerLink =>
      upsert(db["provider-links"], providerLink),
    upsertSource: () =>
      Effect.fail(
        new LibraryError({
          reason: "config",
          message: "source records were removed; use providers/provider-links",
        }),
      ),
    upsertSystem: system => upsertSystemMetadata(db, system),
    upsertApp: app => upsert(db.launchers, app),
    upsertRuntime: runtime => upsert(db.runtimes, runtime),
    upsertProfile: profile => upsert(db.profiles, profile),
    upsertUser: user => upsert(db.users, user),
    upsertCollection: collection => upsert(db.collections, collection),

    canResolveLaunchForPlayable: (playableId, opts) =>
      Effect.gen(function* () {
        const snapshot = yield* loadReadableSnapshot(db, _options)
        const entry = derivePlayableEntries([
          ...snapshot.library.values(),
        ]).find(candidate => candidate.id === playableId)
        if (!entry) return false
        const releaseIds = opts?.releaseId
          ? [opts.releaseId]
          : entry.releases
              .filter(release => release.target !== undefined)
              .map(release => release.id)
        for (const releaseId of releaseIds) {
          const canResolve = yield* resolveReadableLaunchContext(snapshot, {
            playableId,
            releaseId,
            appId: opts?.appId,
            userId: opts?.userId,
            profileId: opts?.profileId ?? opts?.presetId,
            override: opts?.override,
          }).pipe(
            Effect.flatMap(context => {
              const integration = findReadableLaunchIntegration(
                context,
                _options,
              )
              if (integration) {
                return Effect.succeed(integration.canResolve(context))
              }
              if (isProviderQualifiedReadableApp(context)) {
                return Effect.succeed(false)
              }
              return composeReadableLaunchSpec(context.app, context).pipe(
                Effect.as(true),
              )
            }),
            Effect.match({
              onFailure: () => false,
              onSuccess: result => result,
            }),
          )
          if (canResolve) return true
        }
        return false
      }),

    resolveLaunchForPlayable: (playableId, opts) =>
      Effect.gen(function* () {
        const snapshot = yield* loadReadableSnapshot(db, _options)
        const context = yield* resolveReadableLaunchContext(snapshot, {
          playableId,
          releaseId: opts?.releaseId,
          appId: opts?.appId,
          userId: opts?.userId,
          profileId: opts?.profileId ?? opts?.presetId,
          override: opts?.override,
        }).pipe(Effect.mapError(toLibraryConfigError))
        const materialized: {
          readonly spec: LaunchSpec
          readonly launchMetadata?: LaunchMetadata
          readonly launchPrepare?: LaunchPrepareMap
          readonly artifacts?: LaunchArtifacts
          readonly diagnostics?: readonly string[]
        } = yield* Effect.gen(function* () {
          const integration = findReadableLaunchIntegration(context, _options)
          if (integration) {
            return yield* integration
              .materialize(context, { env: _options.env })
              .pipe(Effect.mapError(toLibraryConfigError))
          }
          if (isProviderQualifiedReadableApp(context)) {
            return yield* Effect.fail(
              new LibraryError({
                reason: "config",
                message: `no launch integration registered for provider-qualified app kind ${appRecordKind(context.app)}`,
              }),
            )
          }
          return yield* composeReadableLaunchSpec(context.app, context).pipe(
            Effect.map(spec => ({ spec })),
            Effect.mapError(toLibraryConfigError),
          )
        })
        const spec = materialized.spec
        const entry = derivePlayableEntries([
          ...snapshot.library.values(),
        ]).find(candidate => candidate.id === playableId)
        const release = entry?.releases.find(
          candidate => candidate.id === context.releaseId,
        )
        const launchMetadata = launchMetadataForContext(
          context,
          materialized.launchMetadata,
        )

        return {
          spec,
          launchCompanions: context.launchCompanions,
          ...(materialized.launchPrepare
            ? { launchPrepare: materialized.launchPrepare }
            : {}),
          ...(launchMetadata ? { launchMetadata } : {}),
          ...(context.moonlight ? { moonlight: context.moonlight } : {}),
          app: {
            id: context.app.id,
            integration: resolvedIntegration(context, _options),
          },
          ...(materialized.artifacts
            ? { artifacts: materialized.artifacts }
            : {}),
          ...(materialized.diagnostics
            ? { diagnostics: materialized.diagnostics }
            : {}),
          ...(context.runtime
            ? {
                runtime: {
                  id: context.runtime.id,
                  ...(context.runtime.path
                    ? { path: context.runtime.path }
                    : {}),
                },
                module: {
                  id: context.runtime.id,
                  ...(context.runtime.path
                    ? { path: context.runtime.path }
                    : {}),
                },
              }
            : {}),
          playable: {
            id: context.playableId,
            itemId: context.itemId,
            ...(context.containedId
              ? { containedId: context.containedId }
              : {}),
            ...(entry?.title ? { title: entry.title } : {}),
          },
          release: toPlayableReleaseEntry(
            release ?? {
              id: context.releaseId,
              system: context.system,
            },
          ),
          ...(context.content ? { content: context.content } : {}),
        }
      }),

    asLibrarySource: () => ({
      list: () => Effect.runPromise(repository.listPlayableEntries()),
      launchSpecFor: (id, releaseId) =>
        Effect.runPromise(
          repository.resolveLaunchForPlayable(id, { releaseId }).pipe(
            Effect.matchEffect({
              onSuccess: resolved => Effect.succeed(resolved.spec),
              onFailure: error =>
                error.reason === "config"
                  ? Effect.succeed(undefined)
                  : Effect.fail(error),
            }),
          ),
        ),
      canResolveLaunchForGame: (id, inputs) =>
        Effect.runPromise(repository.canResolveLaunchForPlayable(id, inputs)),
      resolveLaunchForGame: (id, inputs) =>
        Effect.runPromise(repository.resolveLaunchForPlayable(id, inputs)),
    }),

    listGames: () =>
      repository
        .listPlayableEntries()
        .pipe(Effect.map(entries => entries.map(toCompatGameRecord))),
    upsertGame: game => upsertLegacyGame(db, game),
    upsertGlobalConfig: payload => upsertLegacyGlobalConfig(db, payload),
    upsertLauncher: launcher => upsertLegacyLauncher(db, launcher),
    upsertModule: module => upsertLegacyModule(db, module),
    upsertImportedGame: record =>
      Effect.gen(function* () {
        yield* upsertLegacyLauncher(db, record.launcher)
        yield* upsertLegacySystemDelta(
          db,
          record.systemDelta,
          record.launcher.id,
        )
        yield* upsertLegacyGame(db, {
          ...record.game,
          launcher: record.game.launcher ?? record.launcher.id,
          core:
            record.game.core ?? record.systemDelta?.cores?.[record.launcher.id],
        })
      }),
    adoptArtifact: input =>
      adoptArtifactIntoReadableLibrary(db, input, _options.env ?? {}),
    canResolveLaunchForGame: (gameId, opts) =>
      repository.canResolveLaunchForPlayable(gameId, opts),
    resolveLaunchForGame: (gameId, opts) =>
      repository.resolveLaunchForPlayable(gameId, opts),
    resolveLocalLauncherPolicy: (launcherId, opts) =>
      loadReadableSnapshot(db, _options).pipe(
        Effect.map(snapshot =>
          resolveReadableLocalLauncherPolicy(snapshot, {
            launcherId,
            override: opts?.override,
          }),
        ),
        Effect.mapError(toLibraryConfigError),
      ),
    resolveLocalLauncherCompanionPolicy: (launcherId, opts) =>
      repository
        .resolveLocalLauncherPolicy(launcherId, opts)
        .pipe(Effect.map(policy => policy.launchCompanions)),
  }
  return repository
}

type CollectionApi<T extends { readonly id: string }> = {
  readonly upsert: (input: {
    where: { id: string }
    create: T
    update: T
  }) => Effect.Effect<T, unknown>
  readonly query: () => {
    readonly runPromise: Promise<ReadonlyArray<T>>
  }
}

function isProviderQualifiedReadableApp(
  context: ReadableResolvedLaunchContext,
): boolean {
  const kind = appRecordKind(context.app)
  return kind.startsWith("@") && kind !== "@korri:process"
}

function findReadableLaunchIntegration(
  context: ReadableResolvedLaunchContext,
  options: CreateLibraryRepositoryOptions,
): ReadableLaunchIntegration | undefined {
  const kind = appRecordKind(context.app)
  return options.launchIntegrations?.find(
    integration => integration.kind === kind,
  )
}

function resolvedIntegration(
  context: ReadableResolvedLaunchContext,
  options: CreateLibraryRepositoryOptions,
): AppIntegrationKind {
  const integration = findReadableLaunchIntegration(context, options)
  if (integration) return integration.integration
  return "generic-process"
}

function launchMetadataForContext(
  context: ReadableResolvedLaunchContext,
  materialized: LaunchMetadata | undefined,
): LaunchMetadata | undefined {
  const appKind = appRecordKind(context.app)
  const appProviderId = isProviderId(appKind)
    ? appKind
    : materialized?.appProviderId
  const annotations = materialized?.annotations
  if (appProviderId === undefined && annotations === undefined) return undefined
  return {
    ...(appProviderId ? { appProviderId } : {}),
    ...(annotations ? { annotations } : {}),
  }
}

function upsertSystemMetadata(
  db: KorriLibraryDb,
  system: SystemRecord,
): Effect.Effect<SystemRecord, LibraryError> {
  return upsert(db.systems, system)
}

const upsert = <T extends { readonly id: string }>(
  collection: CollectionApi<T>,
  record: T,
): Effect.Effect<T, LibraryError> =>
  collection
    .upsert({ where: { id: record.id }, create: record, update: record })
    .pipe(Effect.mapError(toLibraryIoError))

function upsertLegacyGlobalConfig(
  db: KorriLibraryDb,
  payload: unknown,
): Effect.Effect<unknown, LibraryError> {
  const record = { id: LOCAL_HOST_KEY, ...(isRecord(payload) ? payload : {}) }
  return upsert(db.host, record as never).pipe(Effect.as(record))
}

function upsertLegacyLauncher(
  db: KorriLibraryDb,
  launcher: LauncherRecord,
): Effect.Effect<LauncherRecord, LibraryError> {
  const app: AppRecord = {
    id: launcher.id,
    command: launcher.command,
    args: launcher.args.map(readablePlaceholderForLegacy),
    systems: launcher.systems,
    policy: launcher.policy ?? { allowedCommands: [launcher.command] },
    ...(launchCompanionsFromLaunch(launcher)
      ? { launch: { with: launchCompanionsFromLaunch(launcher) } }
      : {}),
    ...(launcher.env ? { env: launcher.env } : {}),
    ...(launcher.cwd ? { cwd: launcher.cwd } : {}),
    ...(launcher.argsAppend ? { argsAppend: launcher.argsAppend } : {}),
    ...(launcher.patches ? { patches: launcher.patches } : {}),
  }
  return upsert(db.launchers, app).pipe(Effect.as(launcher))
}

function upsertLegacyModule(
  db: KorriLibraryDb,
  module: ModuleRecord,
): Effect.Effect<ModuleRecord, LibraryError> {
  const runtime: RuntimeRecord = {
    id: module.id,
    kind: module.kind,
    path: module.path,
  }
  return upsert(db.runtimes, runtime).pipe(Effect.as(module))
}

function upsertLegacySystemDelta(
  db: KorriLibraryDb,
  delta: SystemDelta,
  defaultApp: string,
): Effect.Effect<SystemRecord, LibraryError> {
  return Effect.gen(function* () {
    const runtime = delta.cores?.[defaultApp]
    if (runtime !== undefined) {
      yield* upsert(db.runtimes, {
        id: runtime,
        kind: "libretro-core",
        path: runtime.startsWith("/") ? runtime : `/legacy-cores/${runtime}`,
      })
    }
    const system: SystemRecord = {
      id: delta.id,
      ...(delta.name ? { name: delta.name } : {}),
      ...(delta.manufacturer ? { manufacturer: delta.manufacturer } : {}),
    }
    return yield* upsertSystemMetadata(db, system)
  })
}

function adoptArtifactIntoReadableLibrary(
  db: KorriLibraryDb,
  input: AdoptArtifactInput,
  env: Record<string, string | undefined>,
): Effect.Effect<AdoptArtifactOutput, LibraryError> {
  return Effect.tryPromise({
    try: async () => {
      if (input.source.kind !== "file") {
        throw new LibraryError({
          reason: "config",
          message: "artifact adoption currently supports file sources only",
        })
      }
      const service = createArtifactImportService({
        env,
        repository: createProseqlArtifactRepository(db),
      })
      const artifact = await service.importFile({
        sourcePath: input.source.sourcePath,
        ...(input.artifact as Record<string, unknown>),
      } as never)

      if (!input.library?.createGame) return { artifact }

      const system = input.library.system ?? artifact.system
      if (!system) {
        throw new LibraryError({
          reason: "config",
          message:
            "artifact adoption requires a system to create a library item",
        })
      }
      const localPath = artifact.localPath
      if (!localPath) {
        throw new LibraryError({
          reason: "io",
          message: "artifact import did not return a durable local path",
        })
      }
      const target = relative(artifactsRoot(env), localPath)
        .split(sep)
        .join("/")
      if (target.startsWith("..") || target.startsWith("/")) {
        throw new LibraryError({
          reason: "io",
          message: "artifact durable path escaped the artifact storage root",
        })
      }

      const id = input.library.gameId ?? artifact.id.replace(":", "-")
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* upsert(db.storage, {
            id: "artifact-imports",
            root: artifactsRoot(env),
          })
          yield* upsert(db.library, {
            id,
            ...(input.library?.title ? { title: input.library.title } : {}),
            releases: [
              {
                id: "default",
                system,
                target: {
                  kind: "file",
                  storage: "artifact-imports",
                  path: target,
                },
              },
            ],
          })
          yield* Effect.promise(() => db.flush())
        }),
      )

      return {
        artifact,
        game: {
          id,
          system,
          metadata: input.library.title
            ? { name: input.library.title }
            : undefined,
          content: { artifactId: artifact.id },
        } as GameRecord,
      }
    },
    catch: error =>
      error instanceof LibraryError ? error : toLibraryIoError(error),
  })
}

function upsertLegacyGame(
  db: KorriLibraryDb,
  game: GameRecord,
): Effect.Effect<GameRecord, LibraryError> {
  return Effect.gen(function* () {
    yield* upsert(db.storage, { id: "legacy-files", root: "/" })
    if (game.core !== undefined) {
      yield* upsert(db.runtimes, {
        id: game.core,
        kind: "libretro-core",
        path: game.core.startsWith("/")
          ? game.core
          : `/legacy-cores/${game.core}`,
      })
    }
    for (const [id, profile] of Object.entries(game.presets ?? {})) {
      yield* upsert(db.profiles, { id, ...profile })
    }
    const target = game.contentPath?.replace(/^\/+/, "")
    const parsed = legacyPlayableParts(game.id)
    const appId = game.launch?.app ?? game.launcher
    const runtimeId = game.launch?.module ?? game.core
    const release = {
      id: "default",
      system: game.system,
      ...(target
        ? {
            target: {
              kind: "file" as const,
              storage: "legacy-files",
              path: target,
            },
          }
        : {}),
      ...(appId
        ? {
            launch: {
              use: appId,
              ...(runtimeId ? { runtime: runtimeId } : {}),
            },
          }
        : {}),
    }
    const item: LibraryItemRecord = parsed.containedId
      ? {
          id: parsed.itemId,
          contains: {
            [parsed.containedId]: {
              ...(game.metadata?.name ? { title: game.metadata.name } : {}),
              ...(game.metadata ? { metadata: game.metadata } : {}),
              ...(game.userData ? { userData: game.userData } : {}),
            },
          },
          releases: [release],
        }
      : {
          id: parsed.itemId,
          ...(game.metadata?.name ? { title: game.metadata.name } : {}),
          ...(game.metadata ? { metadata: game.metadata } : {}),
          ...(game.userData ? { userData: game.userData } : {}),
          releases: [release],
        }
    yield* upsert(db.library, item)
    return game
  })
}

function readablePlaceholderForLegacy(value: string): string {
  return value
    .replaceAll("{contentPath}", "{content.path}")
    .replaceAll("{modulePath}", "{runtime.path}")
    .replaceAll("{core}", "{runtime.path}")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function legacyPlayableParts(id: string): {
  readonly itemId: string
  readonly containedId?: string
} {
  const [itemId, containedId, ...rest] = id.split("/")
  if (itemId && containedId && rest.length === 0) return { itemId, containedId }
  return { itemId: id.replaceAll("/", "-") }
}

function toPlayableLibraryEntry(
  entry: PlayableEntry,
  readableLaunchers: ReadonlyMap<string, AppRecord> = new Map(),
): PlayableLibraryEntry {
  const collections = entry.contained?.collections ?? entry.item.collections
  const title = entry.title ?? entry.id
  const versionOf = entry.contained?.["version-of"] ?? entry.item["version-of"]
  const relation = entry.contained?.relation ?? entry.item.relation
  const display = entry.contained?.display ?? entry.item.display
  const metadata = entry.contained?.metadata ?? entry.item.metadata
  const userData = entry.contained?.userData ?? entry.item.userData
  const releases = entry.releases.map(release =>
    toPlayableReleaseEntry(
      release,
      installMetadataForRelease(release, readableLaunchers),
    ),
  )
  return {
    id: entry.id,
    itemId: entry.itemId,
    ...(entry.containedId ? { containedId: entry.containedId } : {}),
    title,
    ...(collections ? { collections } : {}),
    ...(versionOf ? { versionOf } : {}),
    ...(relation ? { relation } : {}),
    ...(display ? { display } : {}),
    releases,
    launchable: releases.some(release => release.launchable),
    ...(releases[0]?.system ? { system: releases[0].system } : {}),
    metadata: { name: title, ...metadata },
    ...(userData ? { userData } : {}),
  }
}

function hydrateReleaseIdentityTags(
  entries: readonly PlayableLibraryEntry[],
  storage: ReadonlyMap<string, StorageRecord>,
): Effect.Effect<readonly PlayableLibraryEntry[], LibraryError> {
  return Effect.tryPromise({
    try: async () =>
      await Promise.all(
        entries.map(async entry => {
          const releases = await Promise.all(
            entry.releases.map(release =>
              hydrateReleaseIdentityTag(release, storage),
            ),
          )
          return releases.some(
            (release, index) => release !== entry.releases[index],
          )
            ? { ...entry, releases }
            : entry
        }),
      ),
    catch: toLibraryIoError,
  })
}

async function hydrateReleaseIdentityTag(
  release: PlayableReleaseEntry,
  storage: ReadonlyMap<string, StorageRecord>,
): Promise<PlayableReleaseEntry> {
  if (release.target?.kind !== "file") {
    return release
  }

  const contentPath = await Effect.runPromise(
    resolveReleaseTarget({ target: release.target, storage }).pipe(
      Effect.match({
        onFailure: () => undefined,
        onSuccess: resolved => resolved.content?.path,
      }),
    ),
  )
  if (contentPath === undefined) return withoutIdentity(release)

  const identity =
    await defaultReleaseContentIdentityResolver.cachedFileHashOrQueue(
      contentPath,
    )
  return identity === undefined
    ? withoutIdentity(release)
    : { ...release, identity }
}

function withoutIdentity(release: PlayableReleaseEntry): PlayableReleaseEntry {
  if (release.identity === undefined) return release
  const { identity: _identity, ...rest } = release
  return rest
}

function hydratePlayableMedia(
  db: KorriLibraryDb,
  entries: readonly PlayableLibraryEntry[],
  env: Record<string, string | undefined>,
): Effect.Effect<readonly PlayableLibraryEntry[], LibraryError> {
  return Effect.gen(function* () {
    const [assets, assignments] = yield* Effect.all(
      [
        readCollection(db["game-assets"]),
        readCollection(db["game-asset-assignments"]),
      ],
      { concurrency: "unbounded" },
    )
    if (assets.length === 0 || assignments.length === 0) return entries

    const assetsById = new Map(
      (assets as readonly GameAssetRecord[]).map(asset => [asset.id, asset]),
    )
    const assignmentsByGame = new Map<string, GameAssetAssignmentRecord[]>()
    for (const assignment of assignments as readonly GameAssetAssignmentRecord[]) {
      const expectedId = `${assignment.gameId}:${assignment.role}`
      if (assignment.id !== expectedId) {
        return yield* Effect.fail(
          new LibraryError({
            reason: "io",
            message: `invalid game asset assignment id '${assignment.id}', expected '${expectedId}'`,
          }),
        )
      }
      const list = assignmentsByGame.get(assignment.gameId) ?? []
      list.push(assignment)
      assignmentsByGame.set(assignment.gameId, list)
    }

    const hydrated = yield* Effect.all(
      entries.map(entry =>
        mediaForPlayable(entry.id, assignmentsByGame, assetsById, env).pipe(
          Effect.map(media => (media.length > 0 ? { ...entry, media } : entry)),
        ),
      ),
      { concurrency: "unbounded" },
    )
    return hydrated
  })
}

function mediaForPlayable(
  playableId: string,
  assignmentsByGame: ReadonlyMap<string, readonly GameAssetAssignmentRecord[]>,
  assetsById: ReadonlyMap<string, GameAssetRecord>,
  env: Record<string, string | undefined>,
) {
  return Effect.tryPromise({
    try: async () => {
      const media = []
      for (const assignment of assignmentsByGame.get(playableId) ?? []) {
        const asset = assetsById.get(assignment.assetId)
        if (!asset) continue
        if (!(await assetBytesMatch(asset, env))) continue
        media.push({
          role: assignment.role,
          type: asset.type,
          width: asset.width,
          height: asset.height,
          ...(asset.source ? { source: asset.source } : {}),
          assetId: asset.id,
          url: `/api/game-assets/${encodeURIComponent(asset.id)}`,
        })
      }
      return media
    },
    catch: toLibraryIoError,
  })
}

async function assetBytesMatch(
  asset: GameAssetRecord,
  env: Record<string, string | undefined>,
): Promise<boolean> {
  try {
    const bytes = await readFile(gameAssetBlobPath(env, asset))
    const expected = asset.id.replace(/^sha256:/, "")
    const actual = createHash("sha256").update(bytes).digest("hex")
    return actual === expected
  } catch {
    return false
  }
}

function toCompatGameRecord(entry: PlayableLibraryEntry): GameRecord {
  const release = entry.releases[0]
  return {
    id: entry.id,
    system: release?.system ?? entry.system ?? "unknown",
    metadata: { name: entry.title ?? entry.id },
  }
}

function toPlayableReleaseEntry(
  release: {
    readonly id: string
    readonly system: string
    readonly source?: unknown
    readonly target?: PlayableReleaseEntry["target"]
    readonly identity?: PlayableReleaseEntry["identity"]
    readonly launch?: {
      readonly use?: string
      readonly plugin?: string
      readonly runtime?: string
    }
    readonly display?: Readonly<Record<string, unknown>>
  },
  install?: PlayableReleaseEntry["install"],
): PlayableReleaseEntry {
  const identity = releaseIdentityTagFor(release)
  return {
    id: release.id,
    system: release.system,
    ...(release.target !== undefined ? { target: release.target } : {}),
    ...(identity !== undefined ? { identity } : {}),
    ...(release.launch
      ? {
          launch: {
            ...(release.launch.use ? { use: release.launch.use } : {}),
            ...(release.launch.plugin ? { plugin: release.launch.plugin } : {}),
            ...(release.launch.runtime
              ? { runtime: release.launch.runtime }
              : {}),
          },
        }
      : {}),
    ...(release.display ? { display: release.display } : {}),
    ...(install ? { install } : {}),
    launchable: release.target !== undefined && release.launch !== undefined,
  }
}

function releaseIdentityTagFor(release: {
  readonly target?: PlayableReleaseEntry["target"]
  readonly identity?: PlayableReleaseEntry["identity"]
}): PlayableReleaseEntry["identity"] | undefined {
  if (release.target?.kind === "provider-ref") {
    return {
      kind: "provider",
      value: {
        provider: release.target.provider,
        ref: release.target.ref,
      },
    }
  }
  return release.identity
}

function loadReadableSnapshot(
  db: KorriLibraryDb,
  options: CreateLibraryRepositoryOptions = {},
): Effect.Effect<ReadableConfigSnapshot, LibraryError> {
  return Effect.gen(function* () {
    const [
      hostRows,
      users,
      systems,
      providers,
      providerLinks,
      storage,
      persistedLaunchers,
      runtimes,
      profiles,
      library,
    ] = yield* Effect.all(
      [
        readCollection(db.host),
        readCollection(db.users),
        readCollection(db.systems),
        readCollection(db.providers),
        readCollection(db["provider-links"]),
        readCollection(db.storage),
        readCollection(db.launchers),
        readCollection(db.runtimes),
        readCollection(db.profiles),
        readCollection(db.library),
      ],
      { concurrency: "unbounded" },
    )

    const host =
      hostRows.find(record => record.id === LOCAL_HOST_KEY) ??
      hostRows[0] ??
      null

    const plugin = pluginReadableRecords(options.pluginRegistry)

    return {
      host,
      users: new Map(users.map(record => [record.id, record])),
      systems: mergeRecordMaps(plugin.systems, systems),
      providers: mergeRecordMaps(plugin.providers, providers),
      providerLinks: new Map(providerLinks.map(record => [record.id, record])),
      storage: new Map(storage.map(record => [record.id, record])),
      readableLaunchers: mergeRecordMaps(plugin.launchers, persistedLaunchers),
      runtimes: mergeRecordMaps(plugin.runtimes, runtimes),
      profiles: new Map(profiles.map(record => [record.id, record])),
      library: new Map(library.map(record => [record.id, record])),
    }
  })
}

interface PluginReadableRecords {
  readonly providers: readonly ProviderRecord[]
  readonly systems: readonly SystemRecord[]
  readonly launchers: readonly AppRecord[]
  readonly runtimes: readonly RuntimeRecord[]
}

function pluginReadableRecords(
  registry: PluginRegistry | undefined,
): PluginReadableRecords {
  if (!registry)
    return { providers: [], systems: [], launchers: [], runtimes: [] }
  return {
    providers: decodePluginReadableMap(
      registry.providers,
      decodeProviderRecord,
    ),
    systems: decodePluginReadableMap(registry.systems, decodeSystemRecord),
    launchers: decodePluginReadableMap(registry.launchers, decodeAppRecord),
    runtimes: decodePluginReadableMap(registry.runtimes, decodeRuntimeRecord),
  }
}

function decodePluginReadableMap<T extends { readonly id: string }>(
  records: ConfigRecordMap,
  decode: (input: unknown) => T,
): readonly T[] {
  return Object.values(records).flatMap(record => {
    try {
      return [decode(record)]
    } catch {
      return []
    }
  })
}

function mergeRecordMaps<T extends { readonly id: string }>(
  pluginRecords: readonly T[],
  storedRecords: readonly T[],
): ReadonlyMap<string, T> {
  return new Map([
    ...pluginRecords.map(record => [record.id, record] as const),
    ...storedRecords.map(record => [record.id, record] as const),
  ])
}

function readCollection<T extends { readonly id: string }>(
  collection: Pick<CollectionApi<T>, "query">,
): Effect.Effect<readonly T[], LibraryError> {
  return Effect.tryPromise({
    try: () => collection.query().runPromise,
    catch: toLibraryIoError,
  })
}

function toLibraryConfigError(error: unknown): LibraryError {
  if (error instanceof LibraryError) return error
  const tag =
    typeof error === "object" && error !== null && "_tag" in error
      ? String((error as { readonly _tag: unknown })._tag)
      : undefined
  const message =
    typeof error === "object" && error !== null && "reason" in error
      ? String((error as { readonly reason: unknown }).reason)
      : error instanceof Error
        ? error.message
        : String(error)
  return new LibraryError({
    reason: "config",
    message: tag ? `${tag}: ${message}` : message,
  })
}

function toLibraryIoError(error: unknown): LibraryError {
  if (error instanceof LibraryError) return error
  return new LibraryError({
    reason: "io",
    message: error instanceof Error ? error.message : String(error),
  })
}

export const listLaunchableReleaseIds = (
  item: LibraryItemRecord,
): readonly string[] =>
  launchableReleases(item.releases).map(release => release.id)

export const parsedPlayableItemId = (playableId: string): string =>
  splitPlayableId(playableId).itemId
