/**
 * pico surface.
 *
 * Aspirational "future" surfaces Korri does not have yet: friends/presence,
 * achievements, leaderboards, and a storefront. All INVENTED in the
 * `LibrarySource` conventions (method-per-concept, `Effect<Result, Error>`) so
 * they could graduate later. `achievementsFor` / `leaderboardFor` take a gameId
 * for shape fidelity though the fixtures are fixed-density.
 */
import { Context, Duration, Effect, Layer, Schema } from "effect"
import type {
  PicoAchievement,
  PicoFriend,
  PicoScoreRow,
  PicoStoreItem,
} from "../fixtures-extra"
import {
  picoAchievements,
  picoFriends,
  picoScores,
  picoStoreItems,
} from "../fixtures-extra"

export class PicoSocialError extends Schema.TaggedErrorClass<PicoSocialError>()(
  "PicoSocialError",
  {
    reason: Schema.Literals(["io", "unavailable"]),
    message: Schema.optional(Schema.String),
  },
) {}

export interface PicoSocialService {
  readonly friends: () => Effect.Effect<readonly PicoFriend[], PicoSocialError>
  readonly achievementsFor: (
    gameId: string,
  ) => Effect.Effect<readonly PicoAchievement[], PicoSocialError>
  readonly leaderboardFor: (
    gameId: string,
  ) => Effect.Effect<readonly PicoScoreRow[], PicoSocialError>
}

export interface PicoStoreService {
  readonly list: () => Effect.Effect<readonly PicoStoreItem[], PicoSocialError>
}

export class PicoSocial extends Context.Service<
  PicoSocial,
  PicoSocialService
>()("PicoSocial") {
  static readonly Fixtures = Layer.succeed(this)({
    friends: () => Effect.succeed(picoFriends),
    achievementsFor: (_gameId: string) => Effect.succeed(picoAchievements),
    leaderboardFor: (_gameId: string) => Effect.succeed(picoScores),
  })

  /** TODO: swap to a real social RPC layer once one exists. */
  static readonly Live = Layer.succeed(this)({
    friends: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return picoFriends
      }),
    achievementsFor: (_gameId: string) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return picoAchievements
      }),
    leaderboardFor: (_gameId: string) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return picoScores
      }),
  })
}

export class PicoStore extends Context.Service<PicoStore, PicoStoreService>()(
  "PicoStore",
) {
  static readonly Fixtures = Layer.succeed(this)({
    list: () => Effect.succeed(picoStoreItems),
  })

  /** TODO: swap to a real storefront RPC layer once one exists. */
  static readonly Live = Layer.succeed(this)({
    list: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return picoStoreItems
      }),
  })
}
