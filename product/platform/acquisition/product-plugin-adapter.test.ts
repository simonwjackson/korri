import { describe, expect, it } from "bun:test"
import { plugin } from "@platform/plugin"
import { createPluginRegistry } from "@platform/plugin/registry"
import { Effect } from "effect"
import { Acquisition, makeLiveAcquisitionLayer } from "./acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "./plugin-loader"
import { acquisitionPluginDefinitionsFromPluginRegistry } from "./product-plugin-adapter"

const claimPlugin = plugin({
  namespace: "@test",
  name: "claims",
  title: "Claim Plugin",
  contributes: {
    handlers: [
      {
        id: "claims.search",
        operation: "claims.search",
        capabilities: ["claims.search"],
        run: () => [
          {
            _tag: "ProviderClaim" as const,
            providerId: "@test:claims",
            id: "one",
            ref: { kind: "provider-item-id" as const, value: "one" },
            title: "One",
            url: "https://example.com/one",
            platform: "pico8",
          },
        ],
      },
      {
        id: "claims.details",
        operation: "claims.details",
        capabilities: ["claims.details"],
        run: () => ({
          _tag: "ProviderClaimDetails" as const,
          providerId: "@test:claims",
          id: "one",
          ref: { kind: "provider-item-id" as const, value: "one" },
          title: "One",
          url: "https://example.com/one",
          description: "Details from a product plugin handler.",
        }),
      },
      {
        id: "claims.validate",
        operation: "provider.validate",
        capabilities: ["provider.validate"],
        run: context => ({
          _tag: "HealthyProvider" as const,
          providerId: context.provider,
          checkedAt: "2026-01-01T00:00:00.000Z",
        }),
      },
      {
        id: "claims.resolve-download",
        operation: "artifact.resolve-download",
        capabilities: ["artifact.resolve-download"],
        run: () => ({
          _tag: "FinalDownload" as const,
          providerId: "@test:claims",
          url: "https://example.com/one.p8.png",
          filename: "one.p8.png",
          contentType: "image/png",
        }),
      },
    ],
  },
})

describe("acquisitionPluginDefinitionsFromPluginRegistry", () => {
  it("projects enabled product plugin claim handlers into acquisition providers", async () => {
    const productRegistry = createPluginRegistry([claimPlugin], {
      enabledPluginIds: [claimPlugin.id],
    })
    const acquisitionDefinitions =
      acquisitionPluginDefinitionsFromPluginRegistry(productRegistry)

    expect(
      acquisitionDefinitions.map(definition => definition.metadata),
    ).toEqual([
      {
        providerId: "@test:claims",
        displayName: "Claim Plugin",
        module: "product/plugins/claims",
        builtIn: true,
        enabledByDefault: false,
        legalRisk: "medium",
        credentialRequired: false,
      },
    ])

    const layer = makeLiveAcquisitionLayer({
      registry: createStaticAcquisitionPluginRegistry(acquisitionDefinitions),
    })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const acquisition = yield* Acquisition
        return {
          search: yield* acquisition.search({ query: "one" }),
          details: yield* acquisition.details({
            providerId: "@test:claims",
            id: "one",
          }),
          health: yield* acquisition.validateProviders({
            providerIds: ["@test:claims"],
          }),
          download: yield* acquisition.resolveDownload({
            providerId: "@test:claims",
            candidateUrl: "https://example.com/one",
          }),
        }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.search.claims[0]?.title).toBe("One")
    expect(result.details.description).toBe(
      "Details from a product plugin handler.",
    )
    expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
    expect(result.download).toMatchObject({
      _tag: "FinalDownload",
      filename: "one.p8.png",
    })
  })

  it("does not expose disabled product plugin handlers to acquisition", () => {
    const productRegistry = createPluginRegistry([claimPlugin])

    expect(
      acquisitionPluginDefinitionsFromPluginRegistry(productRegistry),
    ).toEqual([])
  })
})
