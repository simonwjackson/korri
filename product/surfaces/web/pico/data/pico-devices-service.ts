/**
 * pico surface.
 *
 * Stream hosts + connected seats. `PicoHosts` is a PARTIAL mirror of the catalog
 * peers concept (`CatalogPeerSnapshot` — hostId/displayName/status/…,
 * snapshot.rpc.ts); the gallery's host card renders addr + latency, so the pico
 * host keeps those while echoing the peer status vocabulary. `PicoSeats` is
 * invented in the same conventions. Errors mirror `CatalogFactsError`.
 */
import { Context, Duration, Effect, Layer, Schema } from "effect"
import type { PicoHost, PicoSeat } from "../fixtures-extra"
import { picoHosts, picoSeats } from "../fixtures-extra"

export class PicoDevicesError extends Schema.TaggedErrorClass<PicoDevicesError>()(
  "PicoDevicesError",
  {
    reason: Schema.Literals(["io", "unavailable"]),
    message: Schema.optional(Schema.String),
  },
) {}

export interface PicoHostsService {
  readonly hosts: () => Effect.Effect<readonly PicoHost[], PicoDevicesError>
}

export interface PicoSeatsService {
  readonly seats: () => Effect.Effect<readonly PicoSeat[], PicoDevicesError>
}

export class PicoHosts extends Context.Service<PicoHosts, PicoHostsService>()(
  "PicoHosts",
) {
  static readonly Fixtures = Layer.succeed(this)({
    hosts: () => Effect.succeed(picoHosts),
  })

  /** TODO: swap to the real catalog-peers RPC layer (catalog snapshot peers). */
  static readonly Live = Layer.succeed(this)({
    hosts: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(600))
        return picoHosts
      }),
  })
}

export class PicoSeats extends Context.Service<PicoSeats, PicoSeatsService>()(
  "PicoSeats",
) {
  static readonly Fixtures = Layer.succeed(this)({
    seats: () => Effect.succeed(picoSeats),
  })

  /** TODO: swap to a real seat-metadata RPC layer once one exists. */
  static readonly Live = Layer.succeed(this)({
    seats: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return picoSeats
      }),
  })
}
