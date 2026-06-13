import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  CatalogFactsSource,
  makeInMemoryCatalogFactsSourceLayer,
} from "./catalog-facts-source"

describe("CatalogFactsSource", () => {
  it("returns facts without interpreting presentation state", async () => {
    const facts = {
      entries: [],
      peers: [],
      generation: 1,
      updatedAt: "2026-06-13T00:00:00.000Z",
      health: {
        coordinatorReachable: true,
        self: "ready" as const,
        loadingPeers: 0,
        readyPeers: 0,
        failedPeers: 0,
        generation: 1,
      },
    }

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* CatalogFactsSource
        return yield* source.snapshot("fabric")
      }).pipe(Effect.provide(makeInMemoryCatalogFactsSourceLayer(facts))),
    )

    expect(result).toEqual(facts)
  })
})
