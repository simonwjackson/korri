import { Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { ForegroundSessionGateState } from "@shared/stream/foreground-session-gate-state"
import { ForegroundSessionStatusSource } from "@shared/stream/foreground-session-status-source"
import { makeInMemoryLauncherLayer } from "./launcher-layer-memory"
import { Launcher, LibraryError, LibrarySource } from "./library-services"
import { loadingForeverLibrarySourceLayer } from "./library-source-layer-memory"

export const librarySourceLayerAtom = Atom.make(
  loadingForeverLibrarySourceLayer,
)

export const launcherLayerAtom = Atom.make(
  makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
)

const readyForegroundSessionGateState = {
  _tag: "Ready",
} satisfies ForegroundSessionGateState

export const foregroundSessionStatusLayerAtom = Atom.make(
  Layer.succeed(ForegroundSessionStatusSource)({
    get: () => Effect.succeed(readyForegroundSessionGateState),
  }),
)

export const libraryRuntime = Atom.runtime(get =>
  Layer.merge(get(librarySourceLayerAtom), get(launcherLayerAtom)),
)

const foregroundSessionStatusRuntime = Atom.runtime(get =>
  get(foregroundSessionStatusLayerAtom),
)

export const libraryItemsAtom = libraryRuntime.atom(
  Effect.gen(function* () {
    const source = yield* LibrarySource
    return yield* source.list()
  }),
)

export const foregroundSessionGateStateAtom =
  foregroundSessionStatusRuntime.atom(
    Effect.gen(function* () {
      const source = yield* ForegroundSessionStatusSource
      return yield* source.get()
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
