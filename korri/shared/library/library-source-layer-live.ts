import { logger } from "@shared/logger"
import { Effect, Layer } from "effect"
import { LibraryError, LibrarySource } from "./library-services"
import { openKorriLibraryDb } from "./proseql/library-db"
import {
  createLibraryRepository,
  type LibraryRepository,
} from "./proseql/library-repository"

const DEFAULT_LIBRARY_ROOT = "/storage/korri/library"

export const LibrarySourceLayerLive = Layer.succeed(LibrarySource)({
  list: () =>
    withLibraryRepository(repository => repository.listGames(), "list"),
  launchSpecFor: id =>
    withLibraryRepository(
      repository => repository.launchSpecForGame(id),
      "launchSpecFor",
    ),
})

function withLibraryRepository<T>(
  useRepository: (repository: LibraryRepository) => Effect.Effect<T, unknown>,
  operation: string,
): Effect.Effect<T, LibraryError> {
  return Effect.scoped(
    Effect.gen(function* () {
      const root = buildLibraryRootFromEnv()
      logger.info(
        { sourceKind: "proseql", operation, root },
        "library-source-layer-live: opening ProseQL library",
      )
      const db = yield* openKorriLibraryDb({ root })
      return yield* useRepository(createLibraryRepository(db))
    }),
  ).pipe(Effect.mapError(toLibraryError))
}

function buildLibraryRootFromEnv(): string {
  const rootRaw = process.env.KORRI_LIBRARY_ROOT
  return rootRaw && rootRaw.trim() !== ""
    ? rootRaw.trim()
    : DEFAULT_LIBRARY_ROOT
}

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "io",
    message: error instanceof Error ? error.message : String(error),
  })
}
