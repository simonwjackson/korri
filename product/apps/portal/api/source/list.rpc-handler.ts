import { makeLocalEntrySource } from "@platform/api/rpc/entry-source"
import { DataError } from "@platform/api/rpc/errors"
import { getGameDisplayName } from "@platform/fixtures/games/game"
import {
  type LibraryError,
  LibrarySource,
} from "@platform/library/library-services"
import { logger } from "@platform/logger/logger"
import { Effect } from "effect"
import {
  type ListSourcePayload,
  ListSourceResponse,
  SourceCatalogGame,
} from "./list.rpc"

export const handleListSource = (_payload: typeof ListSourcePayload.Type) =>
  Effect.gen(function* () {
    // Federation v1: app.source.list is always available on library-bearing
    // servers. The legacy KORRI_STREAM_CONTROL_ENABLED gate is gone (R14 /
    // zero-backwards-compat). The per-entry `streamable` flag still tells
    // callers whether a stream-prep is possible — federation peers that
    // can't stream contribute catalog regardless.
    const source = yield* LibrarySource
    const games = yield* source.list().pipe(Effect.mapError(toDataError))
    const localSource = makeLocalEntrySource(process.env)
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
                    source: localSource,
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
