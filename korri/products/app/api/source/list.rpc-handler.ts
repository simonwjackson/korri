import { DataError, ValidationError } from "@shared/api/rpc/errors"
import { getGameDisplayName } from "@shared/fixtures/games/game"
import {
  type LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import { logger } from "@shared/logger/logger"
import { Effect } from "effect"
import { isStreamControlEnabled } from "../stream/control-mode"
import {
  type ListSourcePayload,
  ListSourceResponse,
  SourceCatalogGame,
} from "./list.rpc"

export const handleListSource = (_payload: typeof ListSourcePayload.Type) =>
  Effect.gen(function* () {
    if (!isStreamControlEnabled(process.env)) {
      return yield* Effect.fail(
        new ValidationError({ message: "Korri source catalog is not enabled" }),
      )
    }

    const source = yield* LibrarySource
    const games = yield* source.list().pipe(Effect.mapError(toDataError))
    const sourceGames = yield* Effect.forEach(games, game =>
      source.launchSpecFor(game.id).pipe(
        Effect.matchEffect({
          onSuccess: spec =>
            Effect.succeed(
              spec
                ? new SourceCatalogGame({
                    id: game.id,
                    displayName: getGameDisplayName(game),
                    streamable: true,
                  })
                : undefined,
            ),
          onFailure: (error: LibraryError) =>
            error.reason === "config"
              ? Effect.succeed(undefined)
              : Effect.fail(toDataError(error)),
        }),
      ),
    )

    return new ListSourceResponse({
      games: sourceGames.filter(
        (game): game is SourceCatalogGame => game !== undefined,
      ),
    })
  })

function toDataError(error: LibraryError): DataError {
  const message = error.message ?? "source catalog failed"
  logger.error({ error: message }, "app.source.list: source rejected")
  return new DataError({
    reason: error.reason === "io" ? "ReadFailed" : "Unavailable",
    message,
  })
}
