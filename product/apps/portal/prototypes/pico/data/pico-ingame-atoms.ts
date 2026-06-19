/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Reactive layer over PicoSaves. Same swap-seam shape as the library atoms.
 */
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { PicoSaves } from "./pico-ingame-service"

export const picoSavesLayerAtom = Atom.make(PicoSaves.Fixtures)

export const picoSavesRuntime = Atom.runtime(get => get(picoSavesLayerAtom))

export const picoSaveSlotsAtom = picoSavesRuntime.atom(
  Effect.gen(function* () {
    const saves = yield* PicoSaves
    return yield* saves.slotsFor("anchor")
  }),
)
