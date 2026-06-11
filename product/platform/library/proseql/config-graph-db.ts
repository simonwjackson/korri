/**
 * Korri's read-only config graph.
 *
 * Ordered config-graph roots (generated platform defaults, the durable local
 * root, operator roots, then dynamically mounted removable roots) deep-merge
 * into one effective configuration through ProseQL's `documentGraph` source.
 * This module owns the graph contract: root classification (including the
 * collection-scoped trust restriction for removable media), opt-in fragment
 * discovery globs, the per-fragment validation/trust transform, the plain
 * base codecs, and the read-only guards around the opened graph.
 *
 * The writable canonical library database (and the schema/validation helpers
 * the two share) lives in ./library-db.
 */

import { realpathSync } from "node:fs"
import { sep } from "node:path"
import { logger } from "@platform/logger"
import {
  createPersistentEffectDatabase,
  type DocumentGraphMetadata,
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
import { Effect, Result } from "effect"
import {
  type CollectionApi,
  collectionsSchema,
  InvalidSingletonHostError,
  type KorriLibraryDb,
  LOCAL_HOST_KEY,
  loadSidecarSnapshot,
  removedLegacyCollection,
  type SidecarRecord,
  SidecarRecordNotFoundError,
  type SidecarSnapshot,
  validateReadableDocumentStrictly,
  wrapPlainHostForProseql,
} from "./library-db"

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

/**
 * Per-fragment transform for the read-only config graph. ProseQL decodes a
 * fragment by extension, then hands the decoded document here before deep-merge.
 * Korri applies the same strict canonical validation and plain-`host` wrapping
 * it applies to the writable YAML codec, so every supported format shares
 * identical semantics and `host` is wrapped exactly once (the graph codecs are
 * the plain base codecs, not the host-wrapping YAML shim).
 *
 * Collection scoping for restricted roots is native ProseQL (per-root
 * `collections`, ignored sections surface as `ignored-collection`
 * diagnostics); the transform only narrows validation to the sections the
 * root may contribute so an ignored section is never validated. The
 * symlink-escape guard stays here (no upstream containment yet): an escaping
 * or vanished fragment fails the transform, which the source's
 * `skip-fragment` policy converts into a skipped-fragment diagnostic.
 */
function makeKorriConfigGraphTransform(
  restrictedByRootId: ReadonlyMap<string, ReadonlySet<string>>,
  rootPathByRootId: ReadonlyMap<string, string>,
): DocumentGraphTransform {
  // Per-transform-instance cache (recreated on each openKorriConfigGraph
  // call), so staleness across rebuilds is not a concern. Do not hoist it
  // outside this factory closure.
  const realRootCache = new Map<string, string>()
  const realRootOf = (rootId: string): string | undefined => {
    const cached = realRootCache.get(rootId)
    if (cached !== undefined) return cached
    const rootPath = rootPathByRootId.get(rootId)
    if (rootPath === undefined) return undefined
    try {
      const real = realpathSync(rootPath)
      realRootCache.set(rootId, real)
      return real
    } catch {
      // Root vanished (card yanked mid-build): treat as unresolvable so the
      // fragment is skipped rather than failing the whole graph.
      return undefined
    }
  }

  return (document, context) => {
    try {
      const allowed = restrictedByRootId.get(context.rootId)
      if (allowed !== undefined) {
        const realRoot = realRootOf(context.rootId)
        let realFragment: string
        try {
          realFragment = realpathSync(context.path)
        } catch {
          // Fragment vanished between discovery and transform (card yanked
          // mid-build): fail the fragment so skip-fragment records it as a
          // diagnostic without failing the graph.
          logger.warn(
            { rootId: context.rootId, path: context.path },
            "config-graph: restricted-root fragment vanished mid-build; skipping",
          )
          return Result.fail(
            new Error("restricted-root fragment vanished mid-build"),
          )
        }
        const escapes =
          realRoot === undefined ||
          (realFragment !== realRoot &&
            !realFragment.startsWith(realRoot + sep))
        if (escapes) {
          logger.warn(
            { rootId: context.rootId, path: context.path },
            "config-graph: fragment symlink-escapes its restricted root; skipping",
          )
          return Result.fail(
            new Error("fragment symlink-escapes its restricted root"),
          )
        }
      }
      const validated = validateReadableDocumentStrictly(document, allowed)
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
    // Native per-root collection scoping: ProseQL ignores out-of-scope
    // sections at merge and records an `ignored-collection` diagnostic.
    ...(root.collections !== undefined && root.collections !== "all"
      ? { collections: root.collections }
      : {}),
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
        // Fragment-error containment: a broken fragment (decode, transform,
        // or validation failure) is skipped with a diagnostic instead of
        // failing the whole graph, so a bad card — or a local typo — cannot
        // freeze config rebuilds. Non-fragment errors (a missing
        // non-optional root) still fail the build and retain last-known-good.
        onFragmentError: "skip-fragment" as const,
      },
    ],
  } as const
}

export type KorriConfigGraphConfig = ReturnType<
  typeof makeKorriConfigGraphConfig
>

/**
 * Plain base codecs for the config-graph read path. Unlike the writable
 * library's host-wrapping YAML shim, these do not wrap/validate `host` — that
 * happens once in the per-fragment transform so all formats behave
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
 * The opened read-only config graph: the canonical collections behind
 * read-only guards plus ProseQL's documentGraph metadata (record provenance
 * and load diagnostics).
 */
export type KorriConfigGraphDb = KorriLibraryDb & {
  readonly $documentGraph: DocumentGraphMetadata
}

const withConfigGraphReadOnlyGuards = (
  db: KorriConfigGraphDb,
  sidecars: SidecarSnapshot,
): KorriConfigGraphDb => {
  const guarded: KorriConfigGraphDb = {
    $documentGraph: db.$documentGraph,
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
 * Game-asset/artifact sidecars merged read-only across config roots (later
 * roots win on id collisions). Authoring/writing of sidecars is part of the
 * deferred config write-target work, but reading them keeps catalog media
 * available through the config-graph read path.
 */
async function loadReadOnlyConfigGraphSidecars(
  roots: readonly string[],
): Promise<SidecarSnapshot> {
  const artifacts = new Map<string, SidecarSnapshot["artifacts"][number]>()
  const gameAssets = new Map<string, SidecarSnapshot["gameAssets"][number]>()
  const gameAssetAssignments = new Map<
    string,
    SidecarSnapshot["gameAssetAssignments"][number]
  >()
  for (const root of roots) {
    const snapshot = await loadSidecarSnapshot(root)
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
            db as unknown as KorriConfigGraphDb,
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
