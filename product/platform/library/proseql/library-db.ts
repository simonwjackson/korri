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
 *
 * The read-only config graph (ordered roots, trust transform, read-only
 * guards) lives in ./config-graph-db and shares this module's schema and
 * validation helpers.
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { LocalPlayableId } from "@platform/library/config/playable-id"
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

/**
 * Canonical collection schema shared by the writable library db and the
 * read-only config graph (./config-graph-db).
 */
export const collectionsSchema = {
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

export const isRecord = (value: unknown): value is Record<string, unknown> =>
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

/**
 * Strictly validate the sections of a readable Korri document. When
 * `allowed` is provided, only those sections are validated — the read-only
 * config graph passes a restricted root's permitted collections here so
 * sections the root cannot contribute (which ProseQL ignores at merge) are
 * never validated against the canonical schemas.
 */
export const validateReadableDocumentStrictly = (
  decoded: unknown,
  allowed?: ReadonlySet<string>,
): unknown => {
  if (!isRecord(decoded)) return decoded

  if (
    decoded.host !== undefined &&
    (allowed === undefined || allowed.has("host"))
  ) {
    Schema.decodeUnknownSync(HostPayload)(decoded.host, STRICT)
  }

  for (const [sectionName, schema] of Object.entries(strictMapPayloadSchemas)) {
    if (allowed !== undefined && !allowed.has(sectionName)) continue
    const section = decoded[sectionName]
    if (section === undefined) continue
    if (!isRecord(section)) continue
    if (sectionName === "library") {
      for (const key of Object.keys(section)) {
        Schema.decodeUnknownSync(LocalPlayableId)(key, STRICT)
      }
    }
    for (const payload of Object.values(section)) {
      Schema.decodeUnknownSync(schema)(payload, STRICT)
    }
  }

  return decoded
}

export const wrapPlainHostForProseql = (decoded: unknown): unknown => {
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
        // Opt-in config-graph fragments (`korri.<ext>` / `*.korri.<ext>`) belong
        // to the read-only config graph, never to the writable documents outbox.
        // Excluding them keeps a shared directory from double-loading the same
        // records through both sources.
        exclude: ["**/korri.yaml", "**/*.korri.yaml"],
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
export type CollectionApi<TPayload> = {
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

export const removedLegacyCollection = <TPayload>(
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

export class SidecarRecordNotFoundError extends Error {
  constructor(
    readonly collection: string,
    readonly id: string,
  ) {
    super(`${collection} sidecar record '${id}' was not found`)
  }
}

export type SidecarRecord = { readonly id: string }

type SidecarCollectionApi<TPayload> = CollectionApi<TPayload> & {
  readonly flush: () => Promise<void>
  readonly snapshot: () => ReadonlyArray<SidecarRecord & TPayload>
  readonly restore: (snapshot: ReadonlyArray<SidecarRecord & TPayload>) => void
}

export type SidecarSnapshot = {
  readonly artifacts: ReadonlyArray<SidecarRecord & ArtifactRecord>
  readonly gameAssets: ReadonlyArray<SidecarRecord & GameAssetRecord>
  readonly gameAssetAssignments: ReadonlyArray<
    SidecarRecord & GameAssetAssignmentRecord
  >
}

type SidecarCollections = Pick<
  KorriLibraryDb,
  "artifacts" | "game-assets" | "game-asset-assignments"
> & {
  readonly flush: () => Promise<void>
  readonly snapshot: () => SidecarSnapshot
  readonly restore: (snapshot: SidecarSnapshot) => void
}

async function makeJsonSidecarCollection<TPayload>(
  root: string,
  fileName: string,
  collection: string,
  schema: Schema.Decoder<unknown>,
): Promise<SidecarCollectionApi<TPayload>> {
  const filePath = join(root, fileName)
  const records = new Map<string, SidecarRecord & TPayload>()
  const decode = (input: unknown): SidecarRecord & TPayload =>
    Schema.decodeUnknownSync(schema)(input, STRICT) as SidecarRecord & TPayload

  try {
    const raw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error(`${collection} sidecar must contain a JSON array`)
    }
    const decoded = parsed.map(decode)
    for (const record of decoded) {
      records.set(record.id, record)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }

  const flush = async () => {
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(
      tempPath,
      `${JSON.stringify([...records.values()], null, 2)}\n`,
      "utf8",
    )
    await rename(tempPath, filePath)
  }

  const api = {
    create: record =>
      Effect.try({
        try: () => {
          if (records.has(record.id)) {
            throw new Error(
              `${collection} sidecar record '${record.id}' exists`,
            )
          }
          const decoded = decode(record as SidecarRecord & TPayload)
          records.set(decoded.id, decoded)
          return decoded
        },
        catch: error =>
          error instanceof Error ? error : new Error(String(error)),
      }),
    upsert: input =>
      Effect.try({
        try: () => {
          const next = records.has(input.where.id) ? input.update : input.create
          const decoded = decode(next as SidecarRecord & TPayload)
          if (decoded.id !== input.where.id) {
            throw new Error(
              `${collection} sidecar upsert id '${decoded.id}' did not match where id '${input.where.id}'`,
            )
          }
          records.set(decoded.id, decoded)
          return decoded
        },
        catch: error =>
          error instanceof Error ? error : new Error(String(error)),
      }),
    findById: id =>
      Effect.try({
        try: () => {
          const record = records.get(id)
          if (!record) throw new SidecarRecordNotFoundError(collection, id)
          return record
        },
        catch: error =>
          error instanceof Error ? error : new Error(String(error)),
      }),
    delete: id =>
      Effect.try({
        try: () => {
          records.delete(id)
        },
        catch: error =>
          error instanceof Error ? error : new Error(String(error)),
      }),
    query: () => ({
      get runPromise() {
        return Promise.resolve([...records.values()])
      },
    }),
  } satisfies CollectionApi<TPayload>

  return Object.assign(api, {
    flush,
    snapshot: () => [...records.values()],
    restore: (snapshot: ReadonlyArray<SidecarRecord & TPayload>) => {
      records.clear()
      for (const record of snapshot) records.set(record.id, record)
    },
  })
}

async function makeSidecarCollections(
  root: string,
): Promise<SidecarCollections> {
  const artifacts = await makeJsonSidecarCollection(
    root,
    ".korri-artifacts.json",
    "artifacts",
    ArtifactRecord,
  )
  const gameAssets = await makeJsonSidecarCollection(
    root,
    ".korri-game-assets.json",
    "game-assets",
    GameAssetRecord,
  )
  const gameAssetAssignments = await makeJsonSidecarCollection(
    root,
    ".korri-game-asset-assignments.json",
    "game-asset-assignments",
    GameAssetAssignmentRecord,
  )

  return {
    artifacts: artifacts as KorriLibraryDb["artifacts"],
    "game-assets": gameAssets as KorriLibraryDb["game-assets"],
    "game-asset-assignments":
      gameAssetAssignments as KorriLibraryDb["game-asset-assignments"],
    flush: async () => {
      await Promise.all([
        artifacts.flush(),
        gameAssets.flush(),
        gameAssetAssignments.flush(),
      ])
    },
    snapshot: () => ({
      artifacts: artifacts.snapshot() as ReadonlyArray<
        SidecarRecord & ArtifactRecord
      >,
      gameAssets: gameAssets.snapshot() as ReadonlyArray<
        SidecarRecord & GameAssetRecord
      >,
      gameAssetAssignments: gameAssetAssignments.snapshot() as ReadonlyArray<
        SidecarRecord & GameAssetAssignmentRecord
      >,
    }),
    restore: snapshot => {
      artifacts.restore(snapshot.artifacts)
      gameAssets.restore(snapshot.gameAssets)
      gameAssetAssignments.restore(snapshot.gameAssetAssignments)
    },
  }
}

const validateLibraryItemKey = (id: string) =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(LocalPlayableId)(id, STRICT),
    catch: error => (error instanceof Error ? error : new Error(String(error))),
  })

const withValidatedLibraryCollection = <TPayload>(
  collection: CollectionApi<TPayload>,
): CollectionApi<TPayload> => ({
  create: record =>
    validateLibraryItemKey(record.id).pipe(
      Effect.flatMap(() => collection.create(record)),
    ),
  upsert: input =>
    Effect.all([
      validateLibraryItemKey(input.where.id),
      validateLibraryItemKey(input.create.id),
      validateLibraryItemKey(input.update.id),
    ]).pipe(Effect.flatMap(() => collection.upsert(input))),
  findById: id =>
    validateLibraryItemKey(id).pipe(
      Effect.flatMap(() => collection.findById(id)),
    ),
  delete: id =>
    validateLibraryItemKey(id).pipe(
      Effect.flatMap(() => collection.delete(id)),
    ),
  query: () => collection.query(),
})

const withCanonicalCollectionGuards = (
  db: KorriLibraryDb,
  sidecars: SidecarCollections,
): KorriLibraryDb => ({
  ...db,
  library: withValidatedLibraryCollection(db.library),
  config: removedLegacyCollection("config"),
  launchers: removedLegacyCollection("launchers"),
  modules: removedLegacyCollection("modules"),
  games: removedLegacyCollection("games"),
  artifacts: sidecars.artifacts,
  "game-assets": sidecars["game-assets"],
  "game-asset-assignments": sidecars["game-asset-assignments"],
  flush: async () => {
    await db.flush()
    await sidecars.flush()
  },
  $transaction: <A, E>(fn: (tx: KorriLibraryDb) => Effect.Effect<A, E>) => {
    const snapshot = sidecars.snapshot()
    return db
      .$transaction(tx =>
        fn(withCanonicalCollectionGuards(tx as KorriLibraryDb, sidecars)),
      )
      .pipe(
        Effect.tapCause(() =>
          Effect.sync(() => {
            sidecars.restore(snapshot)
          }),
        ),
      ) as Effect.Effect<A, E>
  },
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

/**
 * One root's game-asset/artifact sidecar snapshot, read through the same
 * JSON sidecar machinery the writable library uses. The read-only config
 * graph (./config-graph-db) merges these across its ordered roots.
 */
export async function loadSidecarSnapshot(
  root: string,
): Promise<SidecarSnapshot> {
  const sidecars = await makeSidecarCollections(root)
  return sidecars.snapshot()
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
      Effect.all({
        db: createPersistentEffectDatabase(config, undefined, {
          writeDebounce: options.writeDebounce ?? 10,
        }).pipe(Effect.provide(persistenceLayer)),
        sidecars: Effect.tryPromise({
          try: () => makeSidecarCollections(options.root),
          catch: error =>
            new Error(error instanceof Error ? error.message : String(error)),
        }),
      }),
    ),
    Effect.map(({ db, sidecars }) =>
      withCanonicalCollectionGuards(db as unknown as KorriLibraryDb, sidecars),
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
