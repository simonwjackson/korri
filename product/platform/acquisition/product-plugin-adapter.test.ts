import { describe, expect, it } from "bun:test"
import { plugin } from "@platform/plugin"
import { createPluginRegistry } from "@platform/plugin/registry"
import { requirePluginService } from "@platform/plugin/services"
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
        run: context => {
          const time = requirePluginService(
            context.services,
            "time",
            context.operation,
          )
          return {
            _tag: "HealthyProvider" as const,
            providerId: context.provider,
            checkedAt: time.nowIso?.() ?? "missing-time-service",
          }
        },
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
      clock: { nowIso: () => "2026-01-01T00:00:00.000Z" },
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

describe("self-managed download session through the unified http", () => {
  it("carries the provider session cookie from resolve-download into the daemon byte-fetch", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const { acquireArtifact } = await import("./artifact-acquisition")
    const { createAcquisitionPluginContext } = await import("./plugin-runtime")

    const fetchLog: Array<{ url: string; headers?: Record<string, string> }> =
      []
    const fakeFetch = (async (url: unknown, init?: RequestInit) => {
      const target = String(url)
      fetchLog.push({
        url: target,
        headers: init?.headers as Record<string, string> | undefined,
      })
      if (target.endsWith("/game")) {
        return {
          status: 200,
          ok: true,
          url: target,
          headers: {
            forEach: () => undefined,
            get: () => null,
            getSetCookie: () => ["session=jar1; Path=/"],
          },
          text: async () => "<html>form</html>",
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
        } as unknown as Response
      }
      return new Response(Buffer.from("ROMBYTES"), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      })
    }) as unknown as typeof fetch

    const romSitePlugin = plugin({
      namespace: "@local",
      name: "romsite",
      title: "ROM Site",
      contributes: {
        handlers: [
          {
            id: "romsite.resolve",
            operation: "artifact.resolve-download",
            capabilities: ["artifact.resolve-download"],
            run: async context => {
              const http = requirePluginService(
                context.services,
                "http",
                context.operation,
              )
              const downloads = requirePluginService(
                context.services,
                "downloads",
                context.operation,
              )
              // Page fetch sets the session cookie in the provider jar.
              await http.request!("https://roms.example.com/game")
              return downloads.final!({
                url: "https://roms.example.com/files/game.gba",
                filename: "game.gba",
                requestHeaders: { referer: "https://roms.example.com/game" },
              })
            },
          },
        ],
      },
    })

    const productRegistry = createPluginRegistry([romSitePlugin], {
      enabledPluginIds: [romSitePlugin.id],
    })
    const definitions =
      acquisitionPluginDefinitionsFromPluginRegistry(productRegistry)
    const registry = createStaticAcquisitionPluginRegistry(definitions)

    const root = await mkdtemp(join(tmpdir(), "korri-session-test-"))
    try {
      const acquired = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext({ fetchImpl: fakeFetch }),
          stagingRoot: root,
          fetchImpl: fakeFetch,
          request: {
            providerId: "@local:romsite",
            id: "game",
            url: "https://roms.example.com/game",
          },
        }),
      )
      expect(acquired.file.name).toBe("game.gba")
    } finally {
      await rm(root, { recursive: true, force: true })
    }

    const byteFetch = fetchLog.find(entry =>
      entry.url.includes("/files/game.gba"),
    )
    expect(byteFetch?.headers).toEqual({
      cookie: "session=jar1",
      referer: "https://roms.example.com/game",
    })
  })
})
