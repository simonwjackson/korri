import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  Acquisition,
  makeInMemoryAcquisitionLayer,
} from "./acquisition-service"
import { createAcquisitionPluginRegistry } from "./plugins/registry"
import { validateKnownSourceName } from "./source-names"

const serviceLayer = makeInMemoryAcquisitionLayer({
  search: () =>
    Effect.succeed({
      candidates: [
        {
          _tag: "SourceCandidate",
          sourceName: "itchio",
          id: "game-1",
          title: "Game One",
          url: "https://example.com/game-1",
        },
      ],
    }),
  details: () =>
    Effect.succeed({
      _tag: "SourceDetails",
      sourceName: "itchio",
      id: "game-1",
      title: "Game One",
      url: "https://example.com/game-1",
    }),
  detailsByUrl: () =>
    Effect.succeed({
      _tag: "SourceDetails",
      sourceName: "itchio",
      id: "game-1",
      title: "Game One",
      url: "https://example.com/game-1",
    }),
  plugins: () =>
    Effect.succeed({
      plugins: [
        {
          sourceName: "itchio",
          displayName: "itch.io",
          module: "product/platform/acquisition/plugins/itchio",
          builtIn: true,
          enabledByDefault: true,
          legalRisk: "medium",
          credentialRequired: false,
        },
      ],
    }),
  validateSources: () =>
    Effect.succeed({
      sources: [
        {
          _tag: "HealthySource",
          sourceName: "itchio",
          checkedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    }),
  resolveDownload: () =>
    Effect.succeed({
      _tag: "FinalDownload",
      sourceName: "itchio",
      url: "https://example.com/game.zip",
    }),
})

describe("Acquisition service interface", () => {
  it("returns all five acquisition operations through an in-memory service", async () => {
    const program = Effect.gen(function* () {
      const acquisition = yield* Acquisition
      return {
        search: yield* acquisition.search({ query: "game" }),
        details: yield* acquisition.details({
          sourceName: "itchio",
          id: "game-1",
        }),
        detailsByUrl: yield* acquisition.detailsByUrl(
          "https://example.com/game-1",
        ),
        plugins: yield* acquisition.plugins(),
        health: yield* acquisition.validateSources({}),
        resolution: yield* acquisition.resolveDownload({
          sourceName: "itchio",
          candidateUrl: "https://example.com/game-1",
        }),
      }
    })

    const result = await Effect.runPromise(
      Effect.provide(program, serviceLayer),
    )
    expect(result.search.candidates).toHaveLength(1)
    expect(result.details.title).toBe("Game One")
    expect(result.detailsByUrl.title).toBe("Game One")
    expect(result.plugins.plugins[0]?.sourceName).toBe("itchio")
    expect(result.health.sources[0]?._tag).toBe("HealthySource")
    expect(result.resolution._tag).toBe("FinalDownload")
  })

  it("canonicalizes and rejects unknown source names through the registry contract", () => {
    const registry = createAcquisitionPluginRegistry([
      {
        metadata: {
          sourceName: "itchio",
          displayName: "itch.io",
          module: "product/platform/acquisition/plugins/itchio",
          builtIn: true,
          enabledByDefault: true,
          legalRisk: "medium",
          credentialRequired: false,
        },
      },
    ])

    expect(validateKnownSourceName(" ItchIO ", registry.sourceNames)).toBe(
      "itchio",
    )
    expect(() =>
      validateKnownSourceName("../itchio", registry.sourceNames),
    ).toThrow()
    expect(() => registry.get("missing-source")).toThrow()
    expect(() =>
      validateKnownSourceName("itchio-", registry.sourceNames),
    ).toThrow()
  })
})
