/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Reactive layer over PicoCatalog. Same swap-seam shape as the library atoms.
 */
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { PicoCatalog } from "./pico-catalog-service"

export const picoCatalogLayerAtom = Atom.make(PicoCatalog.Fixtures)

export const picoCatalogRuntime = Atom.runtime(get =>
  get(picoCatalogLayerAtom),
)

export const picoSystemsAtom = picoCatalogRuntime.atom(
  Effect.gen(function* () {
    const catalog = yield* PicoCatalog
    return yield* catalog.systems()
  }),
)
