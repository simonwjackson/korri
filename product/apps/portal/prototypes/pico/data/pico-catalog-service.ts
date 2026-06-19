/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * The systems/cores catalog. Mirrors `CatalogFactsSource.snapshot`
 * (catalog-facts-source.ts:50) + the `app.catalog.snapshot` RPC
 * (snapshot.rpc.ts): a snapshot carries entries/peers/generation; the gallery
 * only needs the per-system counts, so `systems()` derives them — same idea as
 * the real source deriving facts from catalog entries.
 */
import { Context, Duration, Effect, Layer, Schema } from "effect"
import { PICO_SYSTEMS } from "../fixtures-extra"

/** Mirrors `CatalogFactsError`. */
export class PicoCatalogError extends Schema.TaggedErrorClass<PicoCatalogError>()(
  "PicoCatalogError",
  {
    reason: Schema.Literals(["io", "unavailable"]),
    message: Schema.optional(Schema.String),
  },
) {}

export interface PicoSystem {
  readonly id: string
  readonly name: string
  readonly count: number
}

/** Trimmed echo of `CatalogSnapshotFacts` (entries/peers/generation/…). */
export interface PicoCatalogSnapshot {
  readonly systems: readonly PicoSystem[]
  readonly generation: number
}

export interface PicoCatalogService {
  readonly snapshot: () => Effect.Effect<PicoCatalogSnapshot, PicoCatalogError>
  readonly systems: () => Effect.Effect<readonly PicoSystem[], PicoCatalogError>
}

function makePicoCatalogImpl(): PicoCatalogService {
  const snapshot = () =>
    Effect.succeed<PicoCatalogSnapshot>({
      systems: PICO_SYSTEMS,
      generation: 1,
    })
  return {
    snapshot,
    systems: () => Effect.map(snapshot(), facts => facts.systems),
  }
}

export class PicoCatalog extends Context.Service<
  PicoCatalog,
  PicoCatalogService
>()("PicoCatalog") {
  static readonly Fixtures = Layer.succeed(this)(makePicoCatalogImpl())

  /** TODO: swap to real CatalogFactsSourceLayerRpc (home/catalog-source-layer-rpc.ts). */
  static readonly Live = Layer.succeed(this)({
    snapshot: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(600))
        return { systems: PICO_SYSTEMS, generation: 1 } as const
      }),
    systems: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(600))
        return PICO_SYSTEMS
      }),
  })
}
