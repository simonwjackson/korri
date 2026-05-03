import { Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { makeInMemoryLauncherLayer } from "./launcher-layer-memory"
import { Launcher, LibraryError, LibrarySource } from "./library-services"
import { loadingForeverLibrarySourceLayer } from "./library-source-layer-memory"

export const librarySourceLayerAtom = Atom.make(
  loadingForeverLibrarySourceLayer,
)

export const launcherLayerAtom = Atom.make(
  makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
)

export const libraryRuntime = Atom.runtime(get =>
  Layer.merge(get(librarySourceLayerAtom), get(launcherLayerAtom)),
)

export const libraryItemsAtom = libraryRuntime.atom(
  Effect.gen(function* () {
    const source = yield* LibrarySource
    return yield* source.list()
  }),
)

export const launchAtom = libraryRuntime.fn<string>()(id =>
  Effect.gen(function* () {
    const source = yield* LibrarySource
    const launcher = yield* Launcher
    const spec = yield* source.launchSpecFor(id)

    if (!spec) {
      return yield* Effect.fail(
        new LibraryError({
          reason: "unavailable",
          message: `Unknown game id: ${id}`,
        }),
      )
    }

    return yield* launcher.run(spec)
  }),
)
