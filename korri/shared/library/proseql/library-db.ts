import { join } from "node:path"
import {
  createNodeDatabase,
  type GenerateDatabaseWithPersistence,
} from "@proseql/node"
import { GameMetadata, GameUserData } from "@shared/fixtures/games/game"
import { LaunchSpec } from "@shared/library/launcher"
import { Effect, Schema } from "effect"

export const KORRI_LIBRARY_SCHEMA_VERSION = 1

const initialMigration = {
  from: 0,
  to: KORRI_LIBRARY_SCHEMA_VERSION,
  transform: (record: Record<string, unknown>) => record,
} as const

export const GamePayloadRecord = Schema.Struct({
  metadata: Schema.optional(GameMetadata),
  userData: Schema.optional(GameUserData),
})
export type GamePayloadRecord = Schema.Schema.Type<typeof GamePayloadRecord>

export const LaunchTargetPayloadRecord = Schema.Struct({
  gameId: Schema.String,
  spec: LaunchSpec,
})
export type LaunchTargetPayloadRecord = Schema.Schema.Type<
  typeof LaunchTargetPayloadRecord
>

export const LaunchTargetRecord = Schema.Struct({
  id: Schema.String,
  gameId: Schema.String,
  spec: LaunchSpec,
})
export type LaunchTargetRecord = Schema.Schema.Type<typeof LaunchTargetRecord>

export interface KorriLibraryDbOptions {
  readonly root: string
  readonly writeDebounce?: number
}

export function makeKorriLibraryDbConfig(root: string) {
  return {
    games: {
      schema: GamePayloadRecord,
      id: { kind: "derivedFromKey", field: "id" },
      file: join(root, "games.yaml"),
      version: KORRI_LIBRARY_SCHEMA_VERSION,
      migrations: [initialMigration],
      relationships: {},
    },
    launchTargets: {
      schema: LaunchTargetPayloadRecord,
      id: { kind: "derivedFromKey", field: "id" },
      file: join(root, "launch-targets.yaml"),
      version: KORRI_LIBRARY_SCHEMA_VERSION,
      migrations: [initialMigration],
      relationships: {
        game: { type: "ref", target: "games", foreignKey: "gameId" },
      },
      uniqueFields: ["gameId"],
    },
  } as const
}

export type KorriLibraryDbConfig = ReturnType<typeof makeKorriLibraryDbConfig>
export type KorriLibraryDb =
  GenerateDatabaseWithPersistence<KorriLibraryDbConfig>

export function openKorriLibraryDb(options: KorriLibraryDbOptions) {
  return createNodeDatabase(makeKorriLibraryDbConfig(options.root), undefined, {
    writeDebounce: options.writeDebounce ?? 10,
  }).pipe(Effect.map(db => db as KorriLibraryDb))
}
