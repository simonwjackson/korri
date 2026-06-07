/**
 * Korri's readable canonical library schema.
 *
 * Persisted YAML uses the human-curatable top-level sections
 * `host`, `storage`, `sources`, `systems`, `apps`, `runtimes`,
 * `profiles`, `collections`, `users`, and `library`. This is the
 * application contract: old canonical collection names (`config`,
 * `games`, `launchers`, `modules`) are intentionally not declared.
 *
 * ProseQL document sources are map-keyed internally. Korri's `host`
 * section is the one readable singleton block, so this module registers
 * a tiny YAML codec shim that unwraps/wraps `host` at the file boundary
 * while keeping ProseQL's normal key-derived record machinery in memory.
 */

import { mkdir } from "node:fs/promises"
import { AppPayload, AppRecord } from "@platform/library/config/records/app"
import {
  ArtifactPayload,
  ArtifactRecord,
} from "@platform/library/config/records/artifact"
import {
  CollectionPayload,
  CollectionRecord,
} from "@platform/library/config/records/collection"
import { GamePayload, GameRecord } from "@platform/library/config/records/game"
import {
  GameAssetPayload,
  GameAssetRecord,
} from "@platform/library/config/records/game-asset"
import {
  GameAssetAssignmentPayload,
  GameAssetAssignmentRecord,
} from "@platform/library/config/records/game-asset-assignment"
import {
  GLOBAL_CONFIG_KEY,
  GlobalConfigPayload,
  GlobalConfigRecord,
} from "@platform/library/config/records/global"
import { HostPayload, HostRecord } from "@platform/library/config/records/host"
import {
  LauncherPayload,
  LauncherRecord,
} from "@platform/library/config/records/launcher"
import {
  LibraryItemPayload,
  LibraryItemRecord,
} from "@platform/library/config/records/library-item"
import {
  ModulePayload,
  ModuleRecord,
} from "@platform/library/config/records/module"
import {
  ProfilePayload,
  ProfileRecord,
} from "@platform/library/config/records/profile"
import {
  RuntimePayload,
  RuntimeRecord,
} from "@platform/library/config/records/runtime"
import {
  SourcePayload,
  SourceRecord,
} from "@platform/library/config/records/source"
import {
  StoragePayload,
  StorageRecord,
} from "@platform/library/config/records/storage"
import {
  SystemPayload,
  SystemRecord,
} from "@platform/library/config/records/system"
import { UserPayload, UserRecord } from "@platform/library/config/records/user"
import {
  createPersistentEffectDatabase,
  type FormatCodec,
  yamlCodec,
} from "@proseql/core"
import { makeNodePersistenceLayer } from "@proseql/node"
import { Effect, Schema } from "effect"

export interface KorriLibraryDbOptions {
  readonly root: string
  readonly writeDebounce?: number
}

export const LOCAL_HOST_KEY = "local" as const

const keyedCollection = <TPayload extends Schema.Schema<unknown>>(
  schema: TPayload,
) => ({
  schema,
  id: { kind: "derivedFromKey" as const, field: "id" as const },
  relationships: {},
})

const collectionsSchema = {
  host: keyedCollection(HostPayload),
  storage: keyedCollection(StoragePayload),
  sources: keyedCollection(SourcePayload),
  systems: keyedCollection(SystemPayload),
  apps: keyedCollection(AppPayload),
  runtimes: keyedCollection(RuntimePayload),
  profiles: keyedCollection(ProfilePayload),
  collections: keyedCollection(CollectionPayload),
  users: keyedCollection(UserPayload),
  library: keyedCollection(LibraryItemPayload),
} as const

const baseYamlCodec = yamlCodec()
const STRICT = { onExcessProperty: "error" } as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const cloneRecord = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value))

const strictMapPayloadSchemas = {
  storage: StoragePayload,
  sources: SourcePayload,
  systems: SystemPayload,
  apps: AppPayload,
  runtimes: RuntimePayload,
  profiles: ProfilePayload,
  collections: CollectionPayload,
  users: UserPayload,
  library: LibraryItemPayload,
} as const

const validateReadableDocumentStrictly = (decoded: unknown): unknown => {
  if (!isRecord(decoded)) return decoded

  if (decoded.host !== undefined) {
    Schema.decodeUnknownSync(HostPayload)(decoded.host, STRICT)
  }

  for (const [sectionName, schema] of Object.entries(strictMapPayloadSchemas)) {
    const section = decoded[sectionName]
    if (section === undefined) continue
    if (!isRecord(section)) continue
    for (const payload of Object.values(section)) {
      Schema.decodeUnknownSync(schema)(payload, STRICT)
    }
  }

  return decoded
}

const wrapPlainHostForProseql = (decoded: unknown): unknown => {
  if (!isRecord(decoded)) return decoded
  const host = decoded.host
  if (host === undefined) return decoded
  return {
    ...decoded,
    host: { [LOCAL_HOST_KEY]: host },
  }
}

const unwrapPlainHostForYaml = (data: unknown): unknown => {
  if (!isRecord(data)) return data
  const hostSection = data.host
  if (!isRecord(hostSection)) return data
  const host = hostSection[LOCAL_HOST_KEY]
  if (host === undefined) return data
  const next = cloneRecord(data)
  next.host = host
  return next
}

const korriReadableYamlCodec: FormatCodec = {
  name: "korri-readable-yaml",
  extensions: ["yaml", "yml"],
  decode: raw =>
    wrapPlainHostForProseql(
      validateReadableDocumentStrictly(baseYamlCodec.decode(raw)),
    ),
  encode: (data, options) =>
    baseYamlCodec.encode(unwrapPlainHostForYaml(data), options),
}

export function makeKorriLibraryDbConfig(root: string) {
  return {
    collections: collectionsSchema,
    sources: [
      {
        id: "library" as const,
        kind: "documents" as const,
        root,
        include: "**/*.yaml",
        format: "yaml" as const,
        collections: "all" as const,
        outbox: "library.yaml",
      },
    ],
  } as const
}

export type KorriLibraryDbConfig = ReturnType<typeof makeKorriLibraryDbConfig>

/**
 * Runtime record types (id derived from key); re-exported here for
 * convenience so callers can import current and legacy record types from
 * the database seam while the rest of the big-bang realignment proceeds.
 */
export {
  AppPayload,
  AppRecord,
  ArtifactPayload,
  ArtifactRecord,
  CollectionPayload,
  CollectionRecord,
  GameAssetAssignmentPayload,
  GameAssetAssignmentRecord,
  GameAssetPayload,
  GameAssetRecord,
  GamePayload,
  GameRecord,
  GLOBAL_CONFIG_KEY,
  GlobalConfigPayload,
  GlobalConfigRecord,
  HostPayload,
  HostRecord,
  LauncherPayload,
  LauncherRecord,
  LibraryItemPayload,
  LibraryItemRecord,
  ModulePayload,
  ModuleRecord,
  ProfilePayload,
  ProfileRecord,
  RuntimePayload,
  RuntimeRecord,
  SourcePayload,
  SourceRecord,
  StoragePayload,
  StorageRecord,
  SystemPayload,
  SystemRecord,
  UserPayload,
  UserRecord,
}

/**
 * Effect-y db handle returned by `openKorriLibraryDb`. Canonical persisted
 * collections are first-class; legacy fields remain in the TypeScript seam
 * only so dependent modules can be realigned in follow-up slices without
 * turning this schema-contract slice into the whole application rewrite.
 */
type CollectionApi<TPayload> = {
  readonly create: (
    record: { id: string } & TPayload,
  ) => Effect.Effect<{ id: string } & TPayload, unknown>
  readonly upsert: (input: {
    where: { id: string }
    create: { id: string } & TPayload
    update: { id: string } & TPayload
  }) => Effect.Effect<{ id: string } & TPayload, unknown>
  readonly findById: (
    id: string,
  ) => Effect.Effect<{ id: string } & TPayload, unknown>
  readonly delete: (id: string) => Effect.Effect<void, unknown>
  readonly query: () => {
    readonly runPromise: Promise<ReadonlyArray<{ id: string } & TPayload>>
  }
}

export interface KorriLibraryDb {
  readonly host: CollectionApi<Schema.Schema.Type<typeof HostPayload>>
  readonly storage: CollectionApi<Schema.Schema.Type<typeof StoragePayload>>
  readonly sources: CollectionApi<Schema.Schema.Type<typeof SourcePayload>>
  readonly systems: CollectionApi<Schema.Schema.Type<typeof SystemPayload>>
  readonly apps: CollectionApi<Schema.Schema.Type<typeof AppPayload>>
  readonly runtimes: CollectionApi<Schema.Schema.Type<typeof RuntimePayload>>
  readonly profiles: CollectionApi<Schema.Schema.Type<typeof ProfilePayload>>
  readonly collections: CollectionApi<
    Schema.Schema.Type<typeof CollectionPayload>
  >
  readonly users: CollectionApi<Schema.Schema.Type<typeof UserPayload>>
  readonly library: CollectionApi<Schema.Schema.Type<typeof LibraryItemPayload>>

  /** @deprecated old persisted collection; not declared in canonical config. */
  readonly config: CollectionApi<Schema.Schema.Type<typeof GlobalConfigPayload>>
  /** @deprecated old persisted collection; not declared in canonical config. */
  readonly launchers: CollectionApi<Schema.Schema.Type<typeof LauncherPayload>>
  /** @deprecated old persisted collection; not declared in canonical config. */
  readonly modules: CollectionApi<Schema.Schema.Type<typeof ModulePayload>>
  /** @deprecated old persisted collection; not declared in canonical config. */
  readonly games: CollectionApi<Schema.Schema.Type<typeof GamePayload>>
  /** @deprecated old auxiliary collection; not declared in canonical config. */
  readonly artifacts: CollectionApi<Schema.Schema.Type<typeof ArtifactPayload>>
  /** @deprecated old auxiliary collection; not declared in canonical config. */
  readonly "game-assets": CollectionApi<
    Schema.Schema.Type<typeof GameAssetPayload>
  >
  /** @deprecated old auxiliary collection; not declared in canonical config. */
  readonly "game-asset-assignments": CollectionApi<
    Schema.Schema.Type<typeof GameAssetAssignmentPayload>
  >

  readonly flush: () => Promise<void>
  readonly $transaction: <A, E>(
    fn: (tx: KorriLibraryDb) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E>
}

/**
 * Error raised when the `host` collection contains anything other than
 * the internal local singleton key. YAML users still see a plain `host:`
 * block; this catches programmatic writes with arbitrary ids.
 */
export class InvalidSingletonHostError extends Error {
  override readonly name = "InvalidSingletonHostError"
  readonly invalidKeys: readonly string[]
  constructor(keys: readonly string[]) {
    super(
      `host is a singleton plain block; found unexpected host record keys: ${keys.join(", ")}`,
    )
    this.invalidKeys = keys
  }
}

export class LegacyCollectionRemovedError extends Error {
  override readonly name = "LegacyCollectionRemovedError"
  readonly collection: string
  constructor(collection: string) {
    super(
      `legacy library collection '${collection}' is not part of the readable canonical schema`,
    )
    this.collection = collection
  }
}

const removedLegacyCollection = <TPayload>(
  collection: string,
): CollectionApi<TPayload> => {
  const error = () => new LegacyCollectionRemovedError(collection)
  return {
    create: () => Effect.fail(error()),
    upsert: () => Effect.fail(error()),
    findById: () => Effect.fail(error()),
    delete: () => Effect.fail(error()),
    query: () => ({
      get runPromise() {
        return Promise.reject(error())
      },
    }),
  }
}

const withRemovedLegacyCollections = (db: KorriLibraryDb): KorriLibraryDb => ({
  ...db,
  config: removedLegacyCollection("config"),
  launchers: removedLegacyCollection("launchers"),
  modules: removedLegacyCollection("modules"),
  games: removedLegacyCollection("games"),
  artifacts: removedLegacyCollection("artifacts"),
  "game-assets": removedLegacyCollection("game-assets"),
  "game-asset-assignments": removedLegacyCollection("game-asset-assignments"),
  $transaction: <A, E>(fn: (tx: KorriLibraryDb) => Effect.Effect<A, E>) =>
    db.$transaction(tx =>
      fn(withRemovedLegacyCollections(tx)),
    ) as Effect.Effect<A, E>,
})

/** @deprecated retained only for dependent legacy code until repository realignment. */
export class InvalidSingletonConfigError extends Error {
  override readonly name = "InvalidSingletonConfigError"
  readonly invalidKeys: readonly string[]
  constructor(keys: readonly string[]) {
    super(
      `config collection is no longer part of the canonical library schema; found unexpected keys: ${keys.join(", ")}`,
    )
    this.invalidKeys = keys
  }
}

export function openKorriLibraryDb(options: KorriLibraryDbOptions) {
  const config = makeKorriLibraryDbConfig(options.root)
  const persistenceLayer = makeNodePersistenceLayer(config, {
    codecs: [korriReadableYamlCodec],
  })

  return Effect.tryPromise({
    try: () => mkdir(options.root, { recursive: true }),
    catch: error =>
      new Error(error instanceof Error ? error.message : String(error)),
  }).pipe(
    Effect.flatMap(() =>
      createPersistentEffectDatabase(config, undefined, {
        writeDebounce: options.writeDebounce ?? 10,
      }).pipe(Effect.provide(persistenceLayer)),
    ),
    Effect.map(db =>
      withRemovedLegacyCollections(db as unknown as KorriLibraryDb),
    ),
    Effect.tap(db =>
      Effect.tryPromise({
        try: async () => {
          const records = await db.host.query().runPromise
          const bad = records.map(r => r.id).filter(id => id !== LOCAL_HOST_KEY)
          if (bad.length > 0) throw new InvalidSingletonHostError(bad)
        },
        catch: error =>
          error instanceof InvalidSingletonHostError
            ? error
            : new Error(error instanceof Error ? error.message : String(error)),
      }),
    ),
  )
}
