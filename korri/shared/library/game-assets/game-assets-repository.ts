import { DataError, NotFoundError } from "@shared/api/rpc/errors"
import type { GameRecord } from "@shared/library/config/records/game"
import type { GameAssetRecord } from "@shared/library/config/records/game-asset"
import type { GameAssetAssignmentRecord } from "@shared/library/config/records/game-asset-assignment"
import type { KorriLibraryDb } from "@shared/library/proseql/library-db"
import { Effect } from "effect"

export interface GameAssetsRepository {
  readonly ensureGameExists: (
    gameId: string,
  ) => Effect.Effect<GameRecord, NotFoundError | DataError>
  readonly upsertAssetAssignment: (input: {
    readonly asset: GameAssetRecord
    readonly assignment: GameAssetAssignmentRecord
  }) => Effect.Effect<
    {
      readonly asset: GameAssetRecord
      readonly assignment: GameAssetAssignmentRecord
    },
    DataError
  >
}

export function createGameAssetsRepository(
  db: KorriLibraryDb,
): GameAssetsRepository {
  return {
    ensureGameExists: gameId =>
      Effect.tryPromise({
        try: async () => {
          const games = await db.games.query().runPromise
          const game = games.find(candidate => candidate.id === gameId)
          if (!game) throw new MissingGameError()
          return game as GameRecord
        },
        catch: error => {
          if (error instanceof MissingGameError) {
            return new NotFoundError({ message: "game not found" })
          }
          return new DataError({
            reason: "ReadFailed",
            message: `failed to verify game asset assignment game: ${stringifyError(error)}`,
          })
        },
      }),

    upsertAssetAssignment: ({ asset, assignment }) =>
      db
        .$transaction(tx =>
          Effect.gen(function* () {
            yield* tx.gameAssets.upsert({
              where: { id: asset.id },
              create: asset,
              update: asset,
            })
            yield* tx.gameAssetAssignments.upsert({
              where: { id: assignment.id },
              create: assignment,
              update: assignment,
            })
            return { asset, assignment }
          }),
        )
        .pipe(
          Effect.flatMap(result =>
            Effect.tryPromise({
              try: () => db.flush().then(() => result),
              catch: error =>
                new DataError({
                  reason: "WriteFailed",
                  message: `failed to flush game asset assignment: ${stringifyError(error)}`,
                }),
            }),
          ),
          Effect.mapError(error =>
            error instanceof DataError
              ? error
              : new DataError({
                  reason: "WriteFailed",
                  message: `failed to persist game asset assignment: ${stringifyError(error)}`,
                }),
          ),
        ),
  }
}

class MissingGameError extends Error {}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
