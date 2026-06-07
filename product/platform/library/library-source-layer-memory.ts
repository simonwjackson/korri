import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { LaunchSpec } from "@platform/library/launcher"
import {
  type PlayableLibraryEntry,
  playableEntryFromResolvedGame,
} from "@platform/library/playable-library"
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
  readonly games?: readonly ResolvedGameRecord[]
  readonly playableEntries?: readonly PlayableLibraryEntry[]
  readonly behavior?: InMemoryLibrarySourceBehavior
  readonly launchSpecsById?: ReadonlyMap<string, LaunchSpec>
  readonly resolvedLaunchById?: ReadonlyMap<string, ResolvedLaunch>
}

export function makeInMemoryLibrarySourceLayer(
  config: InMemoryLibrarySourceConfig,
) {
  const behavior = config.behavior ?? { kind: "ready" }
  const games = config.games ?? []
  const playableEntries =
    config.playableEntries ?? games.map(playableEntryFromResolvedGame)
  return Layer.succeed(LibrarySource)({
    list: () => {
      if (behavior.kind === "loading-forever") return Effect.never
      if (behavior.kind === "fail-list") return Effect.fail(behavior.error)
      return Effect.succeed(games)
    },
    listPlayableEntries: () => {
      if (behavior.kind === "loading-forever") return Effect.never
      if (behavior.kind === "fail-list") return Effect.fail(behavior.error)
      return Effect.succeed(playableEntries)
    },
    launchSpecFor: (id, releaseId) =>
      Effect.succeed(
        specFor(id, releaseId, config.launchSpecsById) ??
          config.resolvedLaunchById?.get(id)?.spec ??
          (playableEntries.some(game => game.id === id) ||
          games.some(game => game.id === id)
            ? defaultLaunchSpecFor(id, releaseId)
            : undefined),
      ),
    canResolveLaunchForGame: id =>
      Effect.succeed(
        config.resolvedLaunchById?.has(id) === true ||
          config.launchSpecsById?.has(id) === true ||
          playableEntries.some(game => game.id === id) ||
          games.some(game => game.id === id),
      ),
    resolveLaunchForGame: (id, inputs) => {
      const resolved = config.resolvedLaunchById?.get(id)
      if (resolved) return Effect.succeed(resolved)
      const spec = specFor(id, inputs?.releaseId, config.launchSpecsById)
      if (spec) return Effect.succeed({ spec } satisfies ResolvedLaunch)
      if (
        playableEntries.some(game => game.id === id) ||
        games.some(game => game.id === id)
      ) {
        return Effect.succeed({
          spec: defaultLaunchSpecFor(id, inputs?.releaseId),
        } satisfies ResolvedLaunch)
      }
      return Effect.fail(
        new LibraryError({
          reason: "config",
          message: `In-memory library has no resolution for playable ${id}`,
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

function specFor(
  id: string,
  releaseId: string | undefined,
  specs: ReadonlyMap<string, LaunchSpec> | undefined,
): LaunchSpec | undefined {
  return releaseId === undefined
    ? specs?.get(id)
    : (specs?.get(`${id}#${releaseId}`) ?? specs?.get(id))
}

function defaultLaunchSpecFor(id: string, releaseId?: string): LaunchSpec {
  return {
    command: "in-memory-launcher",
    args: releaseId === undefined ? [id] : [id, releaseId],
  }
}
