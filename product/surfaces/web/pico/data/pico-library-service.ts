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
 *
 * Shape fidelity (the requester's top constraint):
 *  - `list()` mirrors `LibrarySource.list` (library-services.ts:97).
 *  - `launch(input)` mirrors the `app.library.launch` RPC payload/response
 *    (launch.rpc.ts) — `LaunchLibraryPayload` → `LaunchLibraryResponse`.
 *  - `PicoLibraryError` mirrors `LibraryError` (library-services.ts:24),
 *    reasons `io | unavailable | config`.
 */
import { Context, Duration, Effect, Layer, Schema } from "effect"
import { type PicoGame, picoGames } from "../fixtures"

/** Mirrors `LibraryError` (library-services.ts:24). */
export class PicoLibraryError extends Schema.TaggedErrorClass<PicoLibraryError>()(
  "PicoLibraryError",
  {
    reason: Schema.Literals(["io", "unavailable", "config"]),
    message: Schema.optional(Schema.String),
  },
) {}

/** Mirrors `LaunchLibraryPayload` (launch.rpc.ts) — the fields a launch needs. */
export interface PicoLaunchInput {
  readonly id: string
  readonly releaseId?: string
  readonly appId?: string
}

/** Mirrors `LaunchLibraryResponse` — accepted launch vs. typed failure. */
export type PicoLaunchResult =
  | { readonly status: "launched" }
  | {
      readonly status: "failed"
      readonly failureKind: string
      readonly exitCode?: number
    }

export interface PicoLibraryService {
  readonly list: () => Effect.Effect<readonly PicoGame[], PicoLibraryError>
  readonly launch: (
    input: PicoLaunchInput,
  ) => Effect.Effect<PicoLaunchResult, PicoLibraryError>
}

/**
 * Behavior variants, mirroring the real in-memory layer's config knobs
 * (`library-source-layer-memory.ts:27`, `ready | loading-forever | fail-list`).
 * The gallery's loading / error / empty / defect demo screens seed the matching
 * variant instead of bespoke props.
 */
export type PicoLibraryBehavior =
  | "ready"
  | "loading-forever"
  | "fail-list"
  | "empty"
  | "defect"

function makePicoLibraryImpl(
  behavior: PicoLibraryBehavior,
): PicoLibraryService {
  const list = (): Effect.Effect<readonly PicoGame[], PicoLibraryError> => {
    switch (behavior) {
      case "loading-forever":
        return Effect.never
      case "fail-list":
        return Effect.fail(
          new PicoLibraryError({
            reason: "unavailable",
            message: "couldn't reach the host's library",
          }),
        )
      case "empty":
        return Effect.succeed([])
      case "defect":
        return Effect.die(new Error("library renderer glitched out"))
      default:
        return Effect.succeed(picoGames)
    }
  }
  return {
    list,
    launch: _input => Effect.succeed({ status: "launched" } as const),
  }
}

export class PicoLibrary extends Context.Service<
  PicoLibrary,
  PicoLibraryService
>()("PicoLibrary") {
  /** Static data — mount any screen against this with zero mocking. */
  static readonly Fixtures = Layer.succeed(this)(makePicoLibraryImpl("ready"))

  /** Where the real layer plugs in. The workshop has no backend, so this
   * simulates RPC latency then resolves; in the app this is a `Layer.effect`
   * building the client over `/api/rpc`.
   * TODO: swap to real LibrarySourceLayerRpc (home/library-source-layer-rpc.ts). */
  static readonly Live = Layer.succeed(this)({
    list: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(700))
        return picoGames
      }),
    launch: (_input: PicoLaunchInput) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(500))
        return { status: "launched" } as const
      }),
  })
}

/** Real `make<Service>Layer(config)` idiom — builds a behavior-specific layer
 * the demo-state screens seed via `useAtomInitialValues`. */
export const makePicoLibraryLayer = (behavior: PicoLibraryBehavior) =>
  Layer.succeed(PicoLibrary)(makePicoLibraryImpl(behavior))
