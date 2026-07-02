/**
 * pico surface.
 *
 * The local/remote multiplayer party (players + seats + readiness). Invented in
 * the `LibrarySource` conventions; no real RPC exists yet.
 */
import { Context, Duration, Effect, Layer, Schema } from "effect"
import type { PicoPlayer } from "../fixtures-extra"
import { picoPlayers } from "../fixtures-extra"

export class PicoPartyError extends Schema.TaggedErrorClass<PicoPartyError>()(
  "PicoPartyError",
  {
    reason: Schema.Literals(["io", "unavailable"]),
    message: Schema.optional(Schema.String),
  },
) {}

export interface PicoPartyService {
  readonly players: () => Effect.Effect<readonly PicoPlayer[], PicoPartyError>
}

export class PicoParty extends Context.Service<PicoParty, PicoPartyService>()(
  "PicoParty",
) {
  static readonly Fixtures = Layer.succeed(this)({
    players: () => Effect.succeed(picoPlayers),
  })

  /** TODO: swap to a real party/session RPC layer once one exists. */
  static readonly Live = Layer.succeed(this)({
    players: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return picoPlayers
      }),
  })
}
