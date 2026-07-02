/**
 * pico surface.
 *
 * Game-detail data: release picker, emulator chooser, resolvable runtimes, and
 * community stats. No real RPC exists for these yet, so they're INVENTED in the
 * same conventions as `LibrarySource` (method-per-concept, `Effect<Result,
 * Error>`); they reuse `PicoLibraryError` so they could graduate behind the same
 * error type. The methods take `gameId` / `releaseId` for shape fidelity even
 * though the fixtures are fixed-density (same as the in-memory library layer).
 */
import { Context, Duration, Effect, Layer } from "effect"
import type {
  PicoAppChoice,
  PicoCommunityStats,
  PicoRelease,
} from "../fixtures-extra"
import {
  PICO_RUNTIMES,
  picoAppChoices,
  picoReleases,
  picoStats,
} from "../fixtures-extra"
import type { PicoLibraryError } from "./pico-library-service"

export interface PicoReleasesService {
  readonly releasesFor: (
    gameId: string,
  ) => Effect.Effect<readonly PicoRelease[], PicoLibraryError>
  readonly appChoicesFor: (
    releaseId: string,
  ) => Effect.Effect<readonly PicoAppChoice[], PicoLibraryError>
  readonly runtimes: () => Effect.Effect<readonly string[], PicoLibraryError>
}

export interface PicoStatsService {
  readonly statsFor: (
    gameId: string,
  ) => Effect.Effect<PicoCommunityStats, PicoLibraryError>
}

export class PicoReleases extends Context.Service<
  PicoReleases,
  PicoReleasesService
>()("PicoReleases") {
  static readonly Fixtures = Layer.succeed(this)({
    releasesFor: (_gameId: string) => Effect.succeed(picoReleases),
    appChoicesFor: (_releaseId: string) => Effect.succeed(picoAppChoices),
    runtimes: () => Effect.succeed(PICO_RUNTIMES),
  })

  /** TODO: swap to a real releases RPC layer once one exists. */
  static readonly Live = Layer.succeed(this)({
    releasesFor: (_gameId: string) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return picoReleases
      }),
    appChoicesFor: (_releaseId: string) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return picoAppChoices
      }),
    runtimes: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return PICO_RUNTIMES
      }),
  })
}

export class PicoStats extends Context.Service<PicoStats, PicoStatsService>()(
  "PicoStats",
) {
  static readonly Fixtures = Layer.succeed(this)({
    statsFor: (_gameId: string) => Effect.succeed(picoStats),
  })

  /** TODO: swap to a real community-stats RPC layer once one exists. */
  static readonly Live = Layer.succeed(this)({
    statsFor: (_gameId: string) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return picoStats
      }),
  })
}
