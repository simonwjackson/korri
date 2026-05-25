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

import type { ConfigSnapshot } from "@shared/library/config/cascade-resolver"

import {
  resolveLaunchContext,
  resolveLocalLauncherGamescopePolicy,
} from "@shared/library/config/cascade-resolver"
import { composeLaunchSpec } from "@shared/library/config/compose-launch-spec"
import type { EphemeralOverride } from "@shared/library/config/ephemeral-override"
import type { CascadeError } from "@shared/library/config/errors"
import { LauncherUnresolvable } from "@shared/library/config/errors"
import type { GamescopePolicy } from "@shared/library/config/inheritable-fields"
import type { CollectionRecord } from "@shared/library/config/records/collection"
import type { GameRecord } from "@shared/library/config/records/game"
import {
  GLOBAL_CONFIG_KEY,
  type GlobalConfigPayload,
  type GlobalConfigRecord,
} from "@shared/library/config/records/global"
import type { LauncherRecord } from "@shared/library/config/records/launcher"
import type { SystemRecord } from "@shared/library/config/records/system"
import type { UserRecord } from "@shared/library/config/records/user"
import type { LaunchSpec } from "@shared/library/launcher"
import { LibraryError } from "@shared/library/library-services"
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
  readonly upsertCollection: (
    collection: CollectionRecord,
  ) => Effect.Effect<CollectionRecord, unknown>
  readonly upsertImportedGame: (
    record: ImportedGameRecord,
  ) => Effect.Effect<void, unknown>
  readonly resolveLaunchForGame: (
    gameId: string,
    opts?: ResolveLaunchOptions,
  ) => Effect.Effect<ResolvedLaunchOutput, CascadeError | LibraryError>
  readonly resolveLocalLauncherGamescopePolicy: (
    launcherId: string,
    opts?: Pick<ResolveLaunchOptions, "override">,
  ) => Effect.Effect<GamescopePolicy, LibraryError>
}

export function createLibraryRepository(db: KorriLibraryDb): LibraryRepository {
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

    resolveLaunchForGame: (gameId, opts) =>
      Effect.gen(function* () {
        const snapshot = yield* loadSnapshot(db)
        const context = yield* resolveLaunchContext(snapshot, {
          gameId,
          userId: opts?.userId,
          presetId: opts?.presetId,
          override: opts?.override,
        })
        const launcher = snapshot.launchers.get(context.launcherId)
        if (!launcher) {
          // Defensive — the cascade resolver guarantees this is set.
          return yield* Effect.fail(new LauncherUnresolvable({ gameId }))
        }
        const spec = yield* composeLaunchSpec(launcher, context)
        return {
          spec,
          ...(context.gamescope ? { gamescope: context.gamescope } : {}),
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

/**
 * Load every collection into an in-memory `ConfigSnapshot` ready to feed
 * the cascade resolver. Mirrors the six declared collections; the
 * singleton config is folded into `snapshot.global`.
 */
function loadSnapshot(
  db: KorriLibraryDb,
): Effect.Effect<ConfigSnapshot, LibraryError> {
  return Effect.gen(function* () {
    const [configRows, users, systems, launchers, games, collections] =
      yield* Effect.all(
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
