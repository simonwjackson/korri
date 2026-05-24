/**
 * Korri's eight-collection library — singleton `config` + map-keyed
 * `users`, `systems`, `launchers`, `games`, `collections`,
 * `gameAssets`, `gameAssetAssignments`.
 *
 * ProseQL 0.13.2's `documents` source variant lets a single YAML file
 * contribute records to multiple declared collections via top-level
 * keys. Any `*.yaml` file rooted at the library directory is a valid
 * source; the importer writes new records to the configured outbox
 * (`library.yaml`) but users can split content however they like.
 *
 * The singleton `config` collection is enforced by its schema: the
 * `GlobalConfigRecord` schema requires `id: "global"` (a literal),
 * so any other key fails decode loudly.
 *
 * Identity-field invariant: `GamePayload` is the only schema with
 * `system` and `contentPath`; the cascade resolver treats them as
 * non-inheritable. Strict-mode decoding on every record schema
 * surfaces typos like `gamescpoe` with file-and-path attribution.
 */

import { mkdir } from "node:fs/promises"
import { createNodeDatabase } from "@proseql/node"
import {
  CollectionPayload,
  CollectionRecord,
} from "@shared/library/config/records/collection"
import { GamePayload, GameRecord } from "@shared/library/config/records/game"
import {
  GameAssetPayload,
  GameAssetRecord,
} from "@shared/library/config/records/game-asset"
import {
  GameAssetAssignmentPayload,
  GameAssetAssignmentRecord,
} from "@shared/library/config/records/game-asset-assignment"
import {
  GLOBAL_CONFIG_KEY,
  GlobalConfigPayload,
  GlobalConfigRecord,
} from "@shared/library/config/records/global"
import {
  LauncherPayload,
  LauncherRecord,
} from "@shared/library/config/records/launcher"
import {
  SystemPayload,
  SystemRecord,
} from "@shared/library/config/records/system"
import { UserPayload, UserRecord } from "@shared/library/config/records/user"
import { Effect, type Schema } from "effect"

export interface KorriLibraryDbOptions {
  readonly root: string
  readonly writeDebounce?: number
}

const collectionsSchema = {
  config: {
    schema: GlobalConfigPayload,
    id: { kind: "derivedFromKey" as const, field: "id" as const },
    relationships: {},
  },
  users: {
    schema: UserPayload,
    id: { kind: "derivedFromKey" as const, field: "id" as const },
    relationships: {},
  },
  systems: {
    schema: SystemPayload,
    id: { kind: "derivedFromKey" as const, field: "id" as const },
    relationships: {},
  },
  launchers: {
    schema: LauncherPayload,
    id: { kind: "derivedFromKey" as const, field: "id" as const },
    relationships: {},
  },
  games: {
    schema: GamePayload,
    id: { kind: "derivedFromKey" as const, field: "id" as const },
    relationships: {},
  },
  gameAssets: {
    schema: GameAssetPayload,
    id: { kind: "derivedFromKey" as const, field: "id" as const },
    relationships: {},
  },
  gameAssetAssignments: {
    schema: GameAssetAssignmentPayload,
    id: { kind: "derivedFromKey" as const, field: "id" as const },
    relationships: {},
  },
  collections: {
    schema: CollectionPayload,
    id: { kind: "derivedFromKey" as const, field: "id" as const },
    relationships: {},
  },
} as const

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
 * convenience so callers can `import { GameRecord } from
 * "@shared/library/proseql/library-db"` without reaching into
 * config/records/*.ts.
 */
export {
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
  LauncherPayload,
  LauncherRecord,
  SystemPayload,
  SystemRecord,
  UserPayload,
  UserRecord,
}

/**
 * Effect-y db handle returned by `openKorriLibraryDb`. We type the
 * collections explicitly so the runtime entity type carries the
 * derived `id` even though the persisted payload omits it.
 *
 * The handle type is built from the collection schemas; runtime
 * objects have `id` hydrated. We rely on the proseql runtime's
 * generic typing for the rest (queries, upserts, watchers).
 */
type CollectionApi<TPayload> = {
  readonly create: (
    record: { id: string } & TPayload,
  ) => Effect.Effect<{ id: string } & TPayload>
  readonly upsert: (input: {
    where: { id: string }
    create: { id: string } & TPayload
    update: { id: string } & TPayload
  }) => Effect.Effect<{ id: string } & TPayload>
  readonly findById: (id: string) => Effect.Effect<{ id: string } & TPayload>
  readonly delete: (id: string) => Effect.Effect<void>
  readonly query: () => {
    readonly runPromise: Promise<ReadonlyArray<{ id: string } & TPayload>>
  }
}

export interface KorriLibraryDb {
  readonly config: CollectionApi<Schema.Schema.Type<typeof GlobalConfigPayload>>
  readonly users: CollectionApi<Schema.Schema.Type<typeof UserPayload>>
  readonly systems: CollectionApi<Schema.Schema.Type<typeof SystemPayload>>
  readonly launchers: CollectionApi<Schema.Schema.Type<typeof LauncherPayload>>
  readonly games: CollectionApi<Schema.Schema.Type<typeof GamePayload>>
  readonly gameAssets: CollectionApi<
    Schema.Schema.Type<typeof GameAssetPayload>
  >
  readonly gameAssetAssignments: CollectionApi<
    Schema.Schema.Type<typeof GameAssetAssignmentPayload>
  >
  readonly collections: CollectionApi<
    Schema.Schema.Type<typeof CollectionPayload>
  >
  readonly flush: () => Promise<void>
  readonly $transaction: <A, E>(
    fn: (tx: KorriLibraryDb) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E>
}

/**
 * Error raised when the `config` collection contains anything other than
 * the singleton `global` key. Surfaced loudly at open time so typos
 * (`config.gloabl: { ... }`) don't silently disappear into nowhere.
 */
export class InvalidSingletonConfigError extends Error {
  override readonly name = "InvalidSingletonConfigError"
  readonly invalidKeys: readonly string[]
  constructor(keys: readonly string[]) {
    super(
      `config collection is a singleton with key '${GLOBAL_CONFIG_KEY}'; found unexpected keys: ${keys.join(", ")}`,
    )
    this.invalidKeys = keys
  }
}

export function openKorriLibraryDb(options: KorriLibraryDbOptions) {
  return Effect.tryPromise({
    try: () => mkdir(options.root, { recursive: true }),
    catch: error =>
      new Error(error instanceof Error ? error.message : String(error)),
  }).pipe(
    Effect.flatMap(() =>
      createNodeDatabase(makeKorriLibraryDbConfig(options.root), undefined, {
        writeDebounce: options.writeDebounce ?? 10,
      }),
    ),
    Effect.map(db => db as unknown as KorriLibraryDb),
    Effect.tap(db =>
      Effect.tryPromise({
        try: async () => {
          // Validate singleton-config invariant at open time.
          const records = await db.config.query().runPromise
          const bad = records
            .map(r => r.id)
            .filter(id => id !== GLOBAL_CONFIG_KEY)
          if (bad.length > 0) throw new InvalidSingletonConfigError(bad)
        },
        catch: error =>
          error instanceof InvalidSingletonConfigError
            ? error
            : new Error(error instanceof Error ? error.message : String(error)),
      }),
    ),
  )
}
