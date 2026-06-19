/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * The reactive layer over PicoLibrary. The provided layer is itself an atom
 * (`picoLibraryLayerAtom`) — THIS is the swap seam: set it to `PicoLibrary.Live`
 * or `PicoLibrary.Fixtures` and every atom built on the runtime re-derives, with
 * no change to any consuming component. Mirrors @platform/react/library/
 * library-atoms (layer atoms → `Atom.runtime` → `runtime.atom`).
 */
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { PicoLibrary } from "./pico-library-service"

/** Swappable provided layer. Default: static fixtures (mount-without-mocking). */
export const picoLibraryLayerAtom = Atom.make(PicoLibrary.Fixtures)

/** Runtime reads the layer atom, so swapping the layer rebuilds the runtime. */
export const picoLibraryRuntime = Atom.runtime(get =>
  get(picoLibraryLayerAtom),
)

/** What a screen actually reads. It yields the service; the layer supplies it. */
export const picoGamesAtom = picoLibraryRuntime.atom(
  Effect.gen(function* () {
    const library = yield* PicoLibrary
    return yield* library.list()
  }),
)
