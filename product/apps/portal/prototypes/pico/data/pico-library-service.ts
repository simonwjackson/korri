/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Effect v4 "mount-without-mocking" shape, applied to pico. The data dependency
 * is a single Context.Service (PicoLibrary) with its layers CO-LOCATED on the
 * service — `.Fixtures` (static data) and `.Live` (where the real RPC layer
 * plugs in). A screen never imports the network; it reads an atom, and the
 * *layer* decides where the data comes from. Swapping Fixtures↔Live needs zero
 * changes to the component — that's why there's nothing to mock.
 *
 * Mirrors korri's real idiom (@platform/library/library-services +
 * @platform/react/library/library-atoms); kept relative-import-only so the
 * throwaway standalone Vite config resolves it without the repo alias plugin.
 */
import { Context, Duration, Effect, Layer, Schema } from "effect"
import { type PicoGame, picoGames } from "../fixtures"

export class PicoLibraryError extends Schema.TaggedErrorClass<PicoLibraryError>()(
  "PicoLibraryError",
  {
    reason: Schema.Literals(["unavailable", "io"]),
    message: Schema.optional(Schema.String),
  },
) {}

export interface PicoLibraryService {
  readonly list: () => Effect.Effect<readonly PicoGame[], PicoLibraryError>
}

export class PicoLibrary extends Context.Service<
  PicoLibrary,
  PicoLibraryService
>()("PicoLibrary") {
  /** Static data — mount any screen against this with zero mocking. */
  static readonly Fixtures = Layer.succeed(this)({
    list: () => Effect.succeed(picoGames),
  })

  /** Where the real layer plugs in. The standalone viewer has no backend, so
   * this simulates RPC latency then resolves; in the app this would be a
   * `Layer.effect` building the client over `/api/rpc`. */
  static readonly Live = Layer.succeed(this)({
    list: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(700))
        return picoGames
      }),
  })
}
