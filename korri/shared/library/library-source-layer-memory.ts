import type { GameRecord } from "@shared/fixtures/games/game"
import type { LaunchSpec } from "@shared/library/launcher"
import { Effect, Layer } from "effect"
import { type LibraryError, LibrarySource } from "./library-services"

export type InMemoryLibrarySourceBehavior =
  | { readonly kind: "ready" }
  | { readonly kind: "loading-forever" }
  | { readonly kind: "fail-list"; readonly error: LibraryError }

export interface InMemoryLibrarySourceConfig {
  readonly games: readonly GameRecord[]
  readonly behavior?: InMemoryLibrarySourceBehavior
  readonly launchSpecsById?: ReadonlyMap<string, LaunchSpec>
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
          (config.games.some(game => game.id === id)
            ? defaultLaunchSpecFor(id)
            : undefined),
      ),
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
