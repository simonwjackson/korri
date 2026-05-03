import * as Atom from "effect/unstable/reactivity/Atom"
import { Effect } from "effect"
import { loadingForeverLayer } from "./library-layer-memory"
import { Library } from "./library-service"

export const libraryLayerAtom = Atom.make(loadingForeverLayer)

export const libraryRuntime = Atom.runtime(get => get(libraryLayerAtom))

export const libraryItemsAtom = libraryRuntime.atom(
  Effect.gen(function* () {
    const library = yield* Library
    return yield* library.list()
  }),
)

export const launchAtom = libraryRuntime.fn<string>()(id =>
  Effect.gen(function* () {
    const library = yield* Library
    return yield* library.launch(id)
  }),
)
