/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * In-session save/load state slots. Invented (no real RPC yet), in the
 * `LibrarySource` conventions; reuses `PicoLibraryError`. `slotsFor(gameId)`
 * takes the game for shape fidelity though the fixture is fixed-density.
 */
import { Context, Duration, Effect, Layer } from "effect"
import type { PicoSaveSlot } from "../fixtures-extra"
import { picoSaveSlots } from "../fixtures-extra"
import type { PicoLibraryError } from "./pico-library-service"

export interface PicoSavesService {
  readonly slotsFor: (
    gameId: string,
  ) => Effect.Effect<readonly PicoSaveSlot[], PicoLibraryError>
}

export class PicoSaves extends Context.Service<PicoSaves, PicoSavesService>()(
  "PicoSaves",
) {
  static readonly Fixtures = Layer.succeed(this)({
    slotsFor: (_gameId: string) => Effect.succeed(picoSaveSlots),
  })

  /** TODO: swap to a real save-state RPC layer once one exists. */
  static readonly Live = Layer.succeed(this)({
    slotsFor: (_gameId: string) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(400))
        return picoSaveSlots
      }),
  })
}
