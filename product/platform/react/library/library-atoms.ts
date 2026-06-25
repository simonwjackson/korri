import type { EntrySource } from "@platform/api/rpc/entry-source"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import {
  Launcher,
  LibraryError,
  LibrarySource,
} from "@platform/library/library-services"
import { loadingForeverLibrarySourceLayer } from "@platform/library/library-source-layer-memory"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import { ForegroundSessionStatusSource } from "@platform/stream/foreground-session-status-source"
import { Duration, Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

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

/**
 * Polls `app.server.status` at 1 Hz via `Atom.withRefresh`. The live layer
 * (`ForegroundSessionStatusLayerLive`) reads sessiond's authoritative mode
 * through `app.server.status` over standard `/api/rpc`; the fixture layer
 * (`ForegroundSessionStatusLayerFixture`) returns a static IdleReady
 * snapshot for live-USB. `Atom.withRefresh` schedules a setTimeout per
 * read that fires `get.refresh(self)` and clears via the atom finalizer
 * when no readers remain (autoDispose is the default), so polling stops
 * when the home/library view unmounts.
 *
 * See: docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md
 */
export const foregroundSessionGateStateAtom = foregroundSessionStatusRuntime
  .atom(
    Effect.gen(function* () {
      const source = yield* ForegroundSessionStatusSource
      return yield* source.get()
    }),
  )
  .pipe(Atom.withRefresh(Duration.seconds(1)))

/**
 * Renderer launch input.
 *
 * `source` is forwarded to bridge-shaped launchers so the desktop bun
 * can route local-source vs remote-source payloads through the right
 * delegate. Spec-shaped launchers (shell/session/memory) ignore it.
 */
export interface LaunchInput {
  readonly id: string
  readonly releaseId?: string
  readonly source?: EntrySource
}

export const launchAtom = libraryRuntime.fn<LaunchInput | string>()(input =>
  Effect.gen(function* () {
    const {
      id,
      releaseId,
      source: entrySource,
      launchAlternatives,
    } = typeof input === "string"
      ? {
          id: input,
          releaseId: undefined,
          source: undefined,
          launchAlternatives: undefined,
        }
      : input
    const source = yield* LibrarySource
    const launcher = yield* Launcher
    const spec = yield* source.launchSpecFor(id, releaseId)

    if (!spec) {
      return yield* Effect.fail(
        new LibraryError({
          reason: "unavailable",
          message: `Unknown game id: ${id}`,
        }),
      )
    }

    return yield* launcher.run(spec, {
      source: entrySource,
      launchAlternatives,
    })
  }),
)
