import { join } from "node:path"
import {
  createNodeDatabase,
  type GenerateDatabaseWithPersistence,
} from "@proseql/node"
import { GameMetadata, GameUserData } from "@shared/fixtures/games/game"
import { LaunchTargetPayloadRecord } from "@shared/library/launcher-config/launch-target"
import { LauncherProfilePayloadRecord } from "@shared/library/launcher-config/launcher-profile"
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

export type { LauncherProfilePayloadRecord, LaunchTargetPayloadRecord }

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
    launcherProfiles: {
      schema: LauncherProfilePayloadRecord,
      id: { kind: "derivedFromKey", field: "id" },
      file: join(root, "launcher-profiles.yaml"),
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
      // Launch targets intentionally validate references during resolution
      // rather than at database-open/write time so legacy resolved-spec rows
      // do not prevent the library from listing games.
      relationships: {},
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
