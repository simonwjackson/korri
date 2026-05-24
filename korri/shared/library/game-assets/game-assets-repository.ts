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
  readonly removeAssetAssignment: (input: {
    readonly gameId: string
    readonly role: GameAssetAssignmentRecord["role"]
  }) => Effect.Effect<
    {
      readonly asset: GameAssetRecord
      readonly assignment: GameAssetAssignmentRecord
    },
    DataError | NotFoundError
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
            yield* tx["game-assets"].upsert({
              where: { id: asset.id },
              create: asset,
              update: asset,
            })
            yield* tx["game-asset-assignments"].upsert({
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

    removeAssetAssignment: ({ gameId, role }) =>
      Effect.gen(function* () {
        const assignmentId = `${gameId}:${role}`
        const assignment = yield* Effect.tryPromise({
          try: async () => {
            const assignments =
              await db["game-asset-assignments"].query().runPromise
            const found = assignments.find(item => item.id === assignmentId)
            if (!found) throw new MissingAssignmentError()
            return found as GameAssetAssignmentRecord
          },
          catch: error => {
            if (error instanceof MissingAssignmentError) {
              return new NotFoundError({
                message: "game asset assignment not found",
              })
            }
            return new DataError({
              reason: "ReadFailed",
              message: `failed to read game asset assignment: ${stringifyError(error)}`,
            })
          },
        })

        const assetOrMissing = yield* Effect.tryPromise({
          try: async () => {
            const assets = await db["game-assets"].query().runPromise
            return (
              (assets.find(item => item.id === assignment.assetId) as
                | GameAssetRecord
                | undefined) ?? null
            )
          },
          catch: error =>
            new DataError({
              reason: "ReadFailed",
              message: `failed to read game asset: ${stringifyError(error)}`,
            }),
        })

        yield* db["game-asset-assignments"].delete(assignmentId).pipe(
          Effect.flatMap(() =>
            Effect.tryPromise({
              try: () => db.flush(),
              catch: error =>
                new DataError({
                  reason: "WriteFailed",
                  message: `failed to flush game asset unassignment: ${stringifyError(error)}`,
                }),
            }),
          ),
          Effect.mapError(error =>
            error instanceof DataError
              ? error
              : new DataError({
                  reason: "WriteFailed",
                  message: `failed to persist game asset unassignment: ${stringifyError(error)}`,
                }),
          ),
        )

        if (!assetOrMissing) {
          return yield* Effect.fail(
            new NotFoundError({ message: "game asset not found" }),
          )
        }

        return { asset: assetOrMissing, assignment }
      }),
  }
}

class MissingAssignmentError extends Error {}

class MissingGameError extends Error {}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
