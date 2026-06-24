/**
 * Node-backed adapter for Korri's readable canonical library schema.
 *
 * Runtime-agnostic schema/config/guards and the in-memory opener live in
 * ./library-db-core so browser-only design-tool bundles can import them
 * without pulling in node:fs/path/crypto. This file keeps the fs sidecars and
 * node persistence layer used by the daemon/server.
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createPersistentEffectDatabase } from "@proseql/core"
import { makeNodePersistenceLayer } from "@proseql/node"
import { Effect, Schema } from "effect"
import {
  ArtifactRecord,
  type CollectionApi,
  GameAssetAssignmentRecord,
  GameAssetRecord,
  InvalidSingletonHostError,
  type KorriLibraryDb,
  type KorriLibraryDbOptions,
  korriReadableYamlCodec,
  LOCAL_HOST_KEY,
  makeKorriLibraryDbConfig,
  type SidecarCollectionApi,
  type SidecarCollections,
  type SidecarRecord,
  SidecarRecordNotFoundError,
  type SidecarSnapshot,
  STRICT,
  withCanonicalCollectionGuards,
} from "./library-db-core"

export * from "./library-db-core"

async function loadJsonSidecarRecords<TPayload>(
  filePath: string,
  collection: string,
  schema: Schema.Decoder<unknown>,
): Promise<ReadonlyArray<SidecarRecord & TPayload>> {
  try {
    const raw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error(`${collection} sidecar must contain a JSON array`)
    }
    return parsed.map(
      input =>
        Schema.decodeUnknownSync(schema)(input, STRICT) as SidecarRecord &
          TPayload,
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

async function makeJsonSidecarCollection<TPayload>(
  root: string,
  fileName: string,
  collection: string,
  schema: Schema.Decoder<unknown>,
): Promise<SidecarCollectionApi<TPayload>> {
  const filePath = join(root, fileName)
  const initialRecords = await loadJsonSidecarRecords<TPayload>(
    filePath,
    collection,
    schema,
  )
  const records = new Map<string, SidecarRecord & TPayload>()
  const decode = (input: unknown): SidecarRecord & TPayload =>
    Schema.decodeUnknownSync(schema)(input, STRICT) as SidecarRecord & TPayload

  for (const record of initialRecords) records.set(record.id, record)

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
    flush: async () => {
      const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
      await writeFile(
        tempPath,
        `${JSON.stringify([...records.values()], null, 2)}\n`,
        "utf8",
      )
      await rename(tempPath, filePath)
    },
    snapshot: () => [...records.values()],
    restore: (snapshot: ReadonlyArray<SidecarRecord & TPayload>) => {
      records.clear()
      for (const record of snapshot) records.set(record.id, record)
    },
  })
}

async function makeFsSidecarCollections(
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
      artifacts: artifacts.snapshot() as SidecarSnapshot["artifacts"],
      gameAssets: gameAssets.snapshot() as SidecarSnapshot["gameAssets"],
      gameAssetAssignments:
        gameAssetAssignments.snapshot() as SidecarSnapshot["gameAssetAssignments"],
    }),
    restore: snapshot => {
      artifacts.restore(snapshot.artifacts)
      gameAssets.restore(snapshot.gameAssets)
      gameAssetAssignments.restore(snapshot.gameAssetAssignments)
    },
  }
}

/**
 * One root's game-asset/artifact sidecar snapshot, read through the same JSON
 * sidecar machinery the writable library uses. The read-only config graph
 * (./config-graph-db) merges these across its ordered roots.
 */
export async function loadSidecarSnapshot(
  root: string,
): Promise<SidecarSnapshot> {
  const sidecars = await makeFsSidecarCollections(root)
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
          try: () => makeFsSidecarCollections(options.root),
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
