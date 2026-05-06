import type { GameRecord } from "@shared/fixtures/games/game"
import { decodeGameRecord } from "@shared/fixtures/games/game"
import type { LaunchSpec } from "@shared/library/launcher"
import { Effect, Schema } from "effect"
import type { KorriLibraryDb } from "./library-db"
import { LaunchTargetRecord } from "./library-db"

export interface ImportedGameRecord {
  readonly game: GameRecord
  readonly launchTarget: LaunchTargetRecord
}

export interface LibraryRepository {
  readonly listGames: () => Effect.Effect<readonly GameRecord[], unknown>
  readonly upsertGame: (game: GameRecord) => Effect.Effect<GameRecord, unknown>
  readonly upsertLaunchTarget: (
    launchTarget: LaunchTargetRecord,
  ) => Effect.Effect<LaunchTargetRecord, unknown>
  readonly launchSpecForGame: (
    gameId: string,
  ) => Effect.Effect<LaunchSpec | undefined, unknown>
  readonly upsertImportedGame: (
    record: ImportedGameRecord,
  ) => Effect.Effect<void, unknown>
}

const decodeLaunchTargetRecord = Schema.decodeUnknownSync(LaunchTargetRecord)

export function createLibraryRepository(db: KorriLibraryDb): LibraryRepository {
  return {
    listGames: () =>
      Effect.promise(() => db.games.query().runPromise).pipe(
        Effect.map(records =>
          records
            .map(record => decodeGameRecord(record))
            .sort(compareByLastPlayedDesc),
        ),
      ),

    upsertGame: game =>
      Effect.gen(function* () {
        const decoded = decodeGameRecord(game)
        const upserted = yield* db.games.upsert({
          where: { id: decoded.id },
          create: decoded,
          update: decoded,
        })
        return decodeGameRecord(upserted)
      }),

    upsertLaunchTarget: launchTarget =>
      Effect.gen(function* () {
        const decoded = decodeLaunchTargetRecord(launchTarget)
        const upserted = yield* db.launchTargets.upsert({
          where: { id: decoded.id },
          create: decoded,
          update: decoded,
        })
        return decodeLaunchTargetRecord(upserted)
      }),

    launchSpecForGame: gameId =>
      Effect.gen(function* () {
        const matches = yield* Effect.promise(
          () => db.launchTargets.query({ where: { gameId } }).runPromise,
        )
        const first = matches[0]
        if (!first) return undefined
        return decodeLaunchTargetRecord(first).spec
      }),

    upsertImportedGame: record =>
      Effect.gen(function* () {
        const game = decodeGameRecord(record.game)
        const launchTarget = decodeLaunchTargetRecord(record.launchTarget)

        yield* db.$transaction(tx =>
          Effect.gen(function* () {
            yield* tx.games.upsert({
              where: { id: game.id },
              create: game,
              update: game,
            })
            yield* tx.launchTargets.upsert({
              where: { id: launchTarget.id },
              create: launchTarget,
              update: launchTarget,
            })
          }),
        )
      }),
  }
}

function compareByLastPlayedDesc(a: GameRecord, b: GameRecord): number {
  const ta = a.userData?.lastPlayed?.getTime()
  const tb = b.userData?.lastPlayed?.getTime()
  if (ta === undefined && tb === undefined) return 0
  if (ta === undefined) return 1
  if (tb === undefined) return -1
  return tb - ta
}
