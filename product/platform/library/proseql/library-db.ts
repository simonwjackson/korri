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

import { randomUUID } from "node:crypto"
import { realpathSync } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join, sep } from "node:path"
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
import { logger } from "@platform/logger"
import {
  createPersistentEffectDatabase,
  type DocumentGraphTransform,
  type FormatCodec,
  hjsonCodec,
  json5Codec,
  jsonCodec,
  jsoncCodec,
  jsonlCodec,
  proseCodec,
  tomlCodec,
  toonCodec,
  yamlCodec,
} from "@proseql/core"
import { makeNodePersistenceLayer } from "@proseql/node"
import { Effect, Result, Schema } from "effect"

export interface KorriLibraryDbOptions {
  readonly root: string
  readonly writeDebounce?: number
}

/**
 * A single ordered config-graph root. Roots are directories only; Korri config
 * fragments are discovered inside them by opt-in basename. Local/operator roots
 * default to optional so an empty baseline graph is valid; generated platform
 * roots should be passed `optional: false` so a missing Nix-store root fails
 * loudly.
 */
export interface KorriConfigGraphRoot {
  readonly root: string
  readonly optional?: boolean
  readonly id?: string
  /**
   * RW/RO classification of the backing mount, carried for the deferred
   * authoring write-target seam (removable-media slice D). Read paths ignore
   * it.
   */
  readonly writable?: boolean
  /**
   * Collections this root may contribute. Omitted (or `"all"`) means the
   * root is trusted for every collection. Restricted roots (removable media)
   * are confined to the listed collections: disallowed sections are dropped
   * pre-merge and fragments that symlink-escape the root are skipped, so a
   * card cannot override execution-privileged config.
   */
  readonly collections?: "all" | readonly string[]
}

/**
 * Data collections an unmarked removable config root may contribute. The
 * execution-privileged collections (`host`, `apps`, `runtimes`, `profiles`,
 * …) stay frozen to trusted static roots; full-power cards require the
 * (future) trusted-marker escalation.
 */
export const REMOVABLE_CONFIG_COLLECTIONS: readonly string[] = [
  "library",
  "collections",
  "users",
]

export interface KorriConfigGraphOptions {
  readonly roots: readonly KorriConfigGraphRoot[]
}

/**
 * Document extensions Korri config fragments may use. Every ProseQL-supported
 * text format plus the prose plugin codec is accepted; the format is syntax
 * only and all formats share identical Korri config semantics.
 */
export const KORRI_CONFIG_EXTENSIONS = [
  "json",
  "ndjson",
  "jsonl",
  "yaml",
  "yml",
  "json5",
  "jsonc",
  "toml",
  "toon",
  "hjson",
  "prose",
] as const

/**
 * Opt-in discovery globs derived from {@link KORRI_CONFIG_EXTENSIONS}. Only
 * `korri.<ext>` and `*.korri.<ext>` fragments are ingested so a config root can
 * point at a broad operator directory without absorbing unrelated documents.
 */
export const KORRI_CONFIG_INCLUDE_GLOBS: readonly string[] =
  KORRI_CONFIG_EXTENSIONS.flatMap(ext => [
    `**/korri.${ext}`,
    `**/*.korri.${ext}`,
  ])

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
 * Drop document sections a restricted root is not permitted to contribute.
 * Enforced pre-merge (per fragment) so ProseQL's ordered "later root wins"
 * deep-merge invariant is untouched — the disallowed keys simply never enter
 * the merge.
 */
function dropDisallowedCollections(
  document: unknown,
  allowed: ReadonlySet<string>,
  context: { readonly rootId: string; readonly path: string },
): unknown {
  if (!isRecord(document)) return document
  const kept: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const [key, value] of Object.entries(document)) {
    if (allowed.has(key)) {
      kept[key] = value
    } else {
      dropped.push(key)
    }
  }
  if (dropped.length > 0) {
    logger.warn(
      { rootId: context.rootId, path: context.path, dropped },
      "config-graph: dropping collections not permitted for restricted root",
    )
  }
  return kept
}

/**
 * Per-fragment transform for the read-only config graph. ProseQL decodes a
 * fragment by extension, then hands the decoded document here before deep-merge.
 * Korri applies the same strict canonical validation and plain-`host` wrapping
 * it applies to the writable YAML codec, so every supported format shares
 * identical semantics and `host` is wrapped exactly once (the graph codecs are
 * the plain base codecs, not the host-wrapping YAML shim).
 *
 * Restricted roots additionally get collection-scoped trust enforcement: a
 * fragment whose resolved real path escapes the root (symlink) is skipped
 * (loaded as an empty document, not fatal), and sections outside the root's
 * allowed collections are dropped before validation and merge.
 */
function makeKorriConfigGraphTransform(
  restrictedByRootId: ReadonlyMap<string, ReadonlySet<string>>,
  rootPathByRootId: ReadonlyMap<string, string>,
): DocumentGraphTransform {
  const realRootCache = new Map<string, string>()
  const realRootOf = (rootId: string): string | undefined => {
    const cached = realRootCache.get(rootId)
    if (cached !== undefined) return cached
    const rootPath = rootPathByRootId.get(rootId)
    if (rootPath === undefined) return undefined
    const real = realpathSync(rootPath)
    realRootCache.set(rootId, real)
    return real
  }

  return (document, context) => {
    try {
      let doc = document
      const allowed = restrictedByRootId.get(context.rootId)
      if (allowed !== undefined) {
        const realRoot = realRootOf(context.rootId)
        const realFragment = realpathSync(context.path)
        const escapes =
          realRoot === undefined ||
          (realFragment !== realRoot &&
            !realFragment.startsWith(realRoot + sep))
        if (escapes) {
          logger.warn(
            { rootId: context.rootId, path: context.path },
            "config-graph: fragment symlink-escapes its restricted root; skipping",
          )
          return Result.succeed({})
        }
        doc = dropDisallowedCollections(doc, allowed, context)
      }
      const validated = validateReadableDocumentStrictly(doc)
      return Result.succeed(wrapPlainHostForProseql(validated))
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }
}

export function makeKorriConfigGraphConfig(
  roots: readonly KorriConfigGraphRoot[],
) {
  const rootConfigs = roots.map((root, index) => ({
    id: root.id ?? `root-${index}`,
    root: root.root,
    optional: root.optional ?? true,
  }))
  const restrictedByRootId = new Map<string, ReadonlySet<string>>()
  const rootPathByRootId = new Map<string, string>()
  roots.forEach((root, index) => {
    const id = rootConfigs[index]?.id
    if (id === undefined) return
    rootPathByRootId.set(id, root.root)
    if (root.collections !== undefined && root.collections !== "all") {
      restrictedByRootId.set(id, new Set(root.collections))
    }
  })
  return {
    collections: collectionsSchema,
    sources: [
      {
        id: "config" as const,
        kind: "documentGraph" as const,
        roots: rootConfigs,
        include: KORRI_CONFIG_INCLUDE_GLOBS,
        collections: "all" as const,
        transform: makeKorriConfigGraphTransform(
          restrictedByRootId,
          rootPathByRootId,
        ),
      },
    ],
  } as const
}

export type KorriConfigGraphConfig = ReturnType<
  typeof makeKorriConfigGraphConfig
>

/**
 * Plain base codecs for the config-graph read path. Unlike
 * {@link korriReadableYamlCodec}, these do not wrap/validate `host` — that
 * happens once in {@link korriConfigGraphTransform} so all formats behave
 * identically.
 */
const korriConfigGraphCodecs: readonly FormatCodec[] = [
  jsonCodec(),
  jsonlCodec(),
  yamlCodec(),
  json5Codec(),
  jsoncCodec(),
  tomlCodec(),
  toonCodec(),
  hjsonCodec(),
  proseCodec(),
]

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

class SidecarRecordNotFoundError extends Error {
  constructor(
    readonly collection: string,
    readonly id: string,
  ) {
    super(`${collection} sidecar record '${id}' was not found`)
  }
}

type SidecarRecord = { readonly id: string }

type SidecarCollectionApi<TPayload> = CollectionApi<TPayload> & {
  readonly flush: () => Promise<void>
  readonly snapshot: () => ReadonlyArray<SidecarRecord & TPayload>
  readonly restore: (snapshot: ReadonlyArray<SidecarRecord & TPayload>) => void
}

type SidecarSnapshot = {
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

export class ConfigGraphReadOnlyError extends Error {
  override readonly name = "ConfigGraphReadOnlyError"
  readonly collection: string
  constructor(collection: string) {
    super(
      `config graph collection '${collection}' is read-only; config authoring write targets are not wired yet`,
    )
    this.collection = collection
  }
}

const readOnlyCollection = <TPayload>(
  collection: CollectionApi<TPayload>,
  name: string,
): CollectionApi<TPayload> => {
  const fail = () => new ConfigGraphReadOnlyError(name)
  return {
    create: () => Effect.fail(fail()),
    upsert: () => Effect.fail(fail()),
    delete: () => Effect.fail(fail()),
    findById: id => collection.findById(id),
    query: () => collection.query(),
  }
}

const readOnlyRecordsCollection = <TPayload>(
  name: string,
  records: ReadonlyArray<SidecarRecord & TPayload>,
): CollectionApi<TPayload> => {
  const byId = new Map(records.map(record => [record.id, record]))
  const fail = () => new ConfigGraphReadOnlyError(name)
  return {
    create: () => Effect.fail(fail()),
    upsert: () => Effect.fail(fail()),
    delete: () => Effect.fail(fail()),
    findById: id => {
      const record = byId.get(id)
      return record === undefined
        ? Effect.fail(new SidecarRecordNotFoundError(name, id))
        : Effect.succeed(record)
    },
    query: () => ({ runPromise: Promise.resolve([...byId.values()]) }),
  }
}

/**
 * Game-asset/artifact sidecars merged read-only across config roots (later
 * roots win on id collisions). Authoring/writing of sidecars is part of the
 * deferred config write-target work, but reading them keeps catalog media
 * available through the config-graph read path.
 */
async function loadReadOnlyConfigGraphSidecars(
  roots: readonly string[],
): Promise<SidecarSnapshot> {
  const artifacts = new Map<string, SidecarRecord & ArtifactRecord>()
  const gameAssets = new Map<string, SidecarRecord & GameAssetRecord>()
  const gameAssetAssignments = new Map<
    string,
    SidecarRecord & GameAssetAssignmentRecord
  >()
  for (const root of roots) {
    const sidecars = await makeSidecarCollections(root)
    const snapshot = sidecars.snapshot()
    for (const record of snapshot.artifacts) artifacts.set(record.id, record)
    for (const record of snapshot.gameAssets) gameAssets.set(record.id, record)
    for (const record of snapshot.gameAssetAssignments)
      gameAssetAssignments.set(record.id, record)
  }
  return {
    artifacts: [...artifacts.values()],
    gameAssets: [...gameAssets.values()],
    gameAssetAssignments: [...gameAssetAssignments.values()],
  }
}

const withConfigGraphReadOnlyGuards = (
  db: KorriLibraryDb,
  sidecars: SidecarSnapshot,
): KorriLibraryDb => {
  const guarded: KorriLibraryDb = {
    host: readOnlyCollection(db.host, "host"),
    storage: readOnlyCollection(db.storage, "storage"),
    sources: readOnlyCollection(db.sources, "sources"),
    systems: readOnlyCollection(db.systems, "systems"),
    apps: readOnlyCollection(db.apps, "apps"),
    runtimes: readOnlyCollection(db.runtimes, "runtimes"),
    profiles: readOnlyCollection(db.profiles, "profiles"),
    collections: readOnlyCollection(db.collections, "collections"),
    users: readOnlyCollection(db.users, "users"),
    library: readOnlyCollection(db.library, "library"),
    config: removedLegacyCollection("config"),
    launchers: removedLegacyCollection("launchers"),
    modules: removedLegacyCollection("modules"),
    games: removedLegacyCollection("games"),
    artifacts: readOnlyRecordsCollection(
      "artifacts",
      sidecars.artifacts,
    ) as unknown as KorriLibraryDb["artifacts"],
    "game-assets": readOnlyRecordsCollection(
      "game-assets",
      sidecars.gameAssets,
    ) as unknown as KorriLibraryDb["game-assets"],
    "game-asset-assignments": readOnlyRecordsCollection(
      "game-asset-assignments",
      sidecars.gameAssetAssignments,
    ) as unknown as KorriLibraryDb["game-asset-assignments"],
    flush: async () => {},
    $transaction: <A, E>(fn: (tx: KorriLibraryDb) => Effect.Effect<A, E>) =>
      fn(guarded),
  }
  return guarded
}

/**
 * Open the read-only Korri config graph from ordered roots. Discovery,
 * extension-driven decoding, per-fragment transform/validation, ordered
 * deep-merge, and read-only graph-owned collections are owned by ProseQL's
 * `documentGraph` source; this seam only adds Korri's canonical guards and the
 * plain-`host` singleton assertion. An empty root list (or roots with no opt-in
 * fragments) is a valid empty graph.
 */
export function openKorriConfigGraph(options: KorriConfigGraphOptions) {
  const config = makeKorriConfigGraphConfig(options.roots)
  const persistenceLayer = makeNodePersistenceLayer(config, {
    codecs: korriConfigGraphCodecs,
  })

  return Effect.flatMap(
    Effect.tryPromise({
      try: () =>
        loadReadOnlyConfigGraphSidecars(options.roots.map(root => root.root)),
      catch: error =>
        new Error(error instanceof Error ? error.message : String(error)),
    }),
    sidecars =>
      createPersistentEffectDatabase(config, undefined, {
        writeDebounce: 10,
      }).pipe(
        Effect.provide(persistenceLayer),
        Effect.map(db =>
          withConfigGraphReadOnlyGuards(
            db as unknown as KorriLibraryDb,
            sidecars,
          ),
        ),
      ),
  ).pipe(
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
