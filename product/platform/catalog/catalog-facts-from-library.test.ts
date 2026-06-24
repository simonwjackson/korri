import { describe, expect, it } from "bun:test"
import { EntrySource } from "@platform/api/rpc/entry-source"
import {
  LibraryError,
  type LibrarySourceService,
} from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { Effect } from "effect"
import { catalogFactsFromLibrarySourceLayer } from "./catalog-facts-from-library"
import { CatalogFactsError, CatalogFactsSource } from "./catalog-facts-source"

const localSource = new EntrySource({
  hostId: "seed-host",
  controlUrl: "memory://seed-host",
  isLocal: true,
})

const playableEntry = (id: string, title = id): PlayableLibraryEntry => ({
  id,
  itemId: id,
  title,
  launchable: true,
  releases: [
    {
      id: "native",
      system: "linux",
      launchable: true,
    },
  ],
  system: "linux",
  metadata: { name: title },
})

function makeSource(
  listPlayableEntries: LibrarySourceService["listPlayableEntries"],
): LibrarySourceService {
  return {
    list: () => Effect.succeed([]),
    listPlayableEntries,
    launchSpecFor: () => Effect.succeed(undefined),
    resolveLaunchForGame: () =>
      Effect.fail(new LibraryError({ reason: "unavailable" })),
  }
}

describe("catalogFactsFromLibrarySourceLayer", () => {
  it("projects playable entries into local catalog facts", async () => {
    const layer = catalogFactsFromLibrarySourceLayer(
      makeSource(() =>
        Effect.succeed([
          playableEntry("hollow-knight", "Hollow Knight"),
          playableEntry("celeste", "Celeste"),
        ]),
      ),
      {
        localSource,
        now: () => "2026-06-23T00:00:00.000Z",
      },
    )

    const facts = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* CatalogFactsSource
        return yield* source.snapshot("self")
      }).pipe(Effect.provide(layer)),
    )

    expect(facts.entries.map(entry => entry.id)).toEqual([
      "hollow-knight",
      "celeste",
    ])
    expect(facts.entries.every(entry => entry.source === localSource)).toBe(
      true,
    )
    expect(facts.peers).toEqual([])
    expect(facts.updatedAt).toBe("2026-06-23T00:00:00.000Z")
    expect(facts.health).toEqual({
      coordinatorReachable: true,
      self: "ready",
      loadingPeers: 0,
      readyPeers: 1,
      failedPeers: 0,
      generation: 1,
    })
  })

  it("returns valid ready facts for an empty library", async () => {
    const layer = catalogFactsFromLibrarySourceLayer(
      makeSource(() => Effect.succeed([])),
      {
        localSource,
        now: () => "2026-06-23T00:00:00.000Z",
      },
    )

    const facts = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* CatalogFactsSource
        return yield* source.snapshot()
      }).pipe(Effect.provide(layer)),
    )

    expect(facts.entries).toEqual([])
    expect(facts.peers).toEqual([])
    expect(facts.health.self).toBe("ready")
    expect(facts.health.readyPeers).toBe(1)
    expect(facts.generation).toBe(1)
  })

  it("maps library-source failures into CatalogFactsError", async () => {
    const layer = catalogFactsFromLibrarySourceLayer(
      makeSource(() =>
        Effect.fail(
          new LibraryError({
            reason: "unavailable",
            message: "library offline",
          }),
        ),
      ),
      { localSource },
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* CatalogFactsSource
        return yield* source.snapshot()
      }).pipe(
        Effect.provide(layer),
        Effect.match({
          onFailure: error => ({ _tag: "Failure" as const, error }),
          onSuccess: value => ({ _tag: "Success" as const, value }),
        }),
      ),
    )

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.error).toBeInstanceOf(CatalogFactsError)
      expect(result.error).toMatchObject({
        reason: "unavailable",
        message: "library offline",
      })
    }
  })
})
