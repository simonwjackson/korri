import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  Acquisition,
  makeInMemoryAcquisitionLayer,
} from "./acquisition-service"
import { createAcquisitionPluginRegistry } from "./plugins/registry"
import { validateKnownProviderId } from "./provider-ids"

const serviceLayer = makeInMemoryAcquisitionLayer({
  search: () =>
    Effect.succeed({
      claims: [
        {
          _tag: "ProviderClaim",
          providerId: "@korri:itchio",
          id: "game-1",
          title: "Game One",
          url: "https://example.com/game-1",
        },
      ],
    }),
  details: () =>
    Effect.succeed({
      _tag: "ProviderClaimDetails",
      providerId: "@korri:itchio",
      id: "game-1",
      title: "Game One",
      url: "https://example.com/game-1",
    }),
  detailsByUrl: () =>
    Effect.succeed({
      _tag: "ProviderClaimDetails",
      providerId: "@korri:itchio",
      id: "game-1",
      title: "Game One",
      url: "https://example.com/game-1",
    }),
  providers: () =>
    Effect.succeed({
      providers: [
        {
          providerId: "@korri:itchio",
          displayName: "itch.io",
          module: "product/platform/acquisition/plugins/itchio",
          builtIn: true,
          enabledByDefault: true,
          legalRisk: "medium",
          credentialRequired: false,
        },
      ],
    }),
  validateProviders: () =>
    Effect.succeed({
      providers: [
        {
          _tag: "HealthyProvider",
          providerId: "@korri:itchio",
          checkedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    }),
  resolveDownload: () =>
    Effect.succeed({
      _tag: "FinalDownload",
      providerId: "@korri:itchio",
      url: "https://example.com/game.zip",
    }),
  acquireArtifact: () =>
    Effect.succeed({
      id: `sha256:${"a".repeat(64)}`,
      kind: "content",
      system: "smbr",
      format: { id: "smbr-level" },
      file: { name: "level.lvl", extension: "lvl" },
      stagedPath: "/tmp/staged/level.lvl",
      digests: { sha256: "a".repeat(64) },
    }),
})

describe("Acquisition service interface", () => {
  it("returns all acquisition operations through an in-memory service", async () => {
    const program = Effect.gen(function* () {
      const acquisition = yield* Acquisition
      return {
        search: yield* acquisition.search({ query: "game" }),
        details: yield* acquisition.details({
          providerId: "@korri:itchio",
          id: "game-1",
        }),
        detailsByUrl: yield* acquisition.detailsByUrl(
          "https://example.com/game-1",
        ),
        providers: yield* acquisition.providers(),
        health: yield* acquisition.validateProviders({}),
        resolution: yield* acquisition.resolveDownload({
          providerId: "@korri:itchio",
          candidateUrl: "https://example.com/game-1",
        }),
        artifact: yield* acquisition.acquireArtifact({
          providerId: "@korri:itchio",
          id: "level-1",
        }),
      }
    })

    const result = await Effect.runPromise(
      Effect.provide(program, serviceLayer),
    )
    expect(result.search.claims).toHaveLength(1)
    expect(result.details.title).toBe("Game One")
    expect(result.detailsByUrl.title).toBe("Game One")
    expect(result.providers.providers[0]?.providerId).toBe("@korri:itchio")
    expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
    expect(result.resolution._tag).toBe("FinalDownload")
    expect(result.artifact.format.id).toBe("smbr-level")
  })

  it("canonicalizes and rejects unknown provider ids through the registry contract", () => {
    const registry = createAcquisitionPluginRegistry([
      {
        metadata: {
          providerId: "@korri:itchio",
          displayName: "itch.io",
          module: "product/platform/acquisition/plugins/itchio",
          builtIn: true,
          enabledByDefault: true,
          legalRisk: "medium",
          credentialRequired: false,
        },
      },
    ])

    expect(
      validateKnownProviderId(" @korri:itchio ", registry.providerIds),
    ).toBe("@korri:itchio")
    expect(() =>
      validateKnownProviderId("itchio", registry.providerIds),
    ).toThrow()
    expect(() => registry.get("@korri:missing-provider")).toThrow()
    expect(() =>
      validateKnownProviderId("@korri:itchio-", registry.providerIds),
    ).toThrow()
  })
})
