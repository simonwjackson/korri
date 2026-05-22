import type { GameRecord } from "@shared/library/config/records/game"
import type { LaunchSpec } from "@shared/library/launcher"
import { Effect, Layer } from "effect"
import {
  LibraryError,
  LibrarySource,
  type ResolvedLaunch,
} from "./library-services"

export type InMemoryLibrarySourceBehavior =
  | { readonly kind: "ready" }
  | { readonly kind: "loading-forever" }
  | { readonly kind: "fail-list"; readonly error: LibraryError }

export interface InMemoryLibrarySourceConfig {
  readonly games: readonly GameRecord[]
  readonly behavior?: InMemoryLibrarySourceBehavior
  readonly launchSpecsById?: ReadonlyMap<string, LaunchSpec>
  readonly resolvedLaunchById?: ReadonlyMap<string, ResolvedLaunch>
}

export function makeInMemoryLibrarySourceLayer(
  config: InMemoryLibrarySourceConfig,
) {
  const behavior = config.behavior ?? { kind: "ready" }
  return Layer.succeed(LibrarySource)({
    list: () => {
      if (behavior.kind === "loading-forever") return Effect.never
      if (behavior.kind === "fail-list") return Effect.fail(behavior.error)
      return Effect.succeed(config.games)
    },
    launchSpecFor: id =>
      Effect.succeed(
        config.launchSpecsById?.get(id) ??
          config.resolvedLaunchById?.get(id)?.spec ??
          (config.games.some(game => game.id === id)
            ? defaultLaunchSpecFor(id)
            : undefined),
      ),
    resolveLaunchForGame: id => {
      const resolved = config.resolvedLaunchById?.get(id)
      if (resolved) return Effect.succeed(resolved)
      const spec = config.launchSpecsById?.get(id)
      if (spec) return Effect.succeed({ spec } satisfies ResolvedLaunch)
      if (config.games.some(g => g.id === id)) {
        return Effect.succeed({
          spec: defaultLaunchSpecFor(id),
        } satisfies ResolvedLaunch)
      }
      return Effect.fail(
        new LibraryError({
          reason: "config",
          message: `In-memory library has no resolution for game ${id}`,
        }),
      )
    },
  })
}

export function makeFailingLibrarySourceLayer(error: LibraryError) {
  return makeInMemoryLibrarySourceLayer({
    games: [],
    behavior: { kind: "fail-list", error },
  })
}

export const loadingForeverLibrarySourceLayer = makeInMemoryLibrarySourceLayer({
  games: [],
  behavior: { kind: "loading-forever" },
})

function defaultLaunchSpecFor(id: string): LaunchSpec {
  return {
    command: "in-memory-launcher",
    args: [id],
  }
}
