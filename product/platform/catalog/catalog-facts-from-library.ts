import { EntrySource } from "@platform/api/rpc/entry-source"
import type {
  LibraryError,
  LibrarySourceService,
} from "@platform/library/library-services"
import { playableEntryFromResolvedGame } from "@platform/library/playable-library"
import { Effect, Layer, Ref } from "effect"
import {
  type CatalogEntry,
  CatalogFactsError,
  CatalogFactsSource,
} from "./catalog-facts-source"

export interface CatalogFactsFromLibraryOptions {
  readonly localSource?: EntrySource
  readonly now?: () => string
}

const defaultLocalSource = new EntrySource({
  hostId: "local",
  controlUrl: "memory://local",
  isLocal: true,
})

export function catalogFactsFromLibrarySourceLayer(
  librarySource: LibrarySourceService,
  options: CatalogFactsFromLibraryOptions = {},
) {
  const localSource = options.localSource ?? defaultLocalSource
  const now = options.now ?? (() => new Date().toISOString())

  return Layer.effect(
    CatalogFactsSource,
    Effect.gen(function* () {
      const generation = yield* Ref.make(0)

      return {
        snapshot: () =>
          Effect.gen(function* () {
            const updatedAt = now()
            const nextGeneration = yield* Ref.updateAndGet(
              generation,
              value => value + 1,
            )
            const entries = yield* listPlayableEntries(librarySource).pipe(
              Effect.mapError(toCatalogFactsError),
            )
            const taggedEntries: readonly CatalogEntry[] = entries.map(
              entry => ({
                ...entry,
                source: localSource,
              }),
            )

            return {
              entries: taggedEntries,
              peers: [],
              generation: nextGeneration,
              updatedAt,
              health: {
                coordinatorReachable: true,
                self: "ready" as const,
                loadingPeers: 0,
                readyPeers: 1,
                failedPeers: 0,
                generation: nextGeneration,
              },
            }
          }),
      }
    }),
  )
}

function listPlayableEntries(librarySource: LibrarySourceService) {
  if (librarySource.listPlayableEntries)
    return librarySource.listPlayableEntries()
  return librarySource
    .list()
    .pipe(Effect.map(entries => entries.map(playableEntryFromResolvedGame)))
}

function toCatalogFactsError(error: LibraryError) {
  return new CatalogFactsError({
    reason: error.reason === "config" ? "invalid" : "unavailable",
    ...(error.message ? { message: error.message } : {}),
  })
}
