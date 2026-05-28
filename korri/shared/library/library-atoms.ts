import type { EntrySource } from "@shared/api/rpc/entry-source"
import type { ForegroundSessionGateState } from "@shared/stream/foreground-session-gate-state"
import { ForegroundSessionStatusSource } from "@shared/stream/foreground-session-status-source"
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

/**
 * Renderer launch input.
 *
 * `source` is forwarded to bridge-shaped launchers so the desktop bun
 * can route local-source vs remote-source payloads through the right
 * delegate. Spec-shaped launchers (shell/session/memory) ignore it.
 */
export interface LaunchInput {
  readonly id: string
  readonly source?: EntrySource
}

export const launchAtom = libraryRuntime.fn<LaunchInput | string>()(input =>
  Effect.gen(function* () {
    const { id, source: entrySource } =
      typeof input === "string" ? { id: input, source: undefined } : input
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

    return yield* launcher.run(spec, { source: entrySource })
  }),
)
