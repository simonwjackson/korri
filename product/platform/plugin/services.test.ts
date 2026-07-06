import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import {
  CLAIMS_SEARCH_OPERATION,
  type PluginOperationContext,
  plugin,
  runPluginHandler,
} from "."
import {
  createProviderScopedPluginServices,
  type PluginServices,
  requirePluginService,
} from "./services"

describe("PluginServices", () => {
  it("lets handlers read injected services without changing the run(context) shape", async () => {
    const services: PluginServices = {
      http: {
        text: () => Promise.resolve("hello from service"),
      },
    }
    const provider = plugin({
      namespace: "@test",
      name: "services",
      contributes: {
        handlers: [
          {
            id: "services.search",
            operation: CLAIMS_SEARCH_OPERATION,
            run: async context => {
              const http = requirePluginService(
                context.services,
                "http",
                context.operation,
              )
              return {
                provider: context.provider,
                body: await http.text?.("https://example.test"),
              }
            },
          },
        ],
      },
    })

    const handler = provider.handlers[0]
    expect(handler).toBeDefined()
    if (!handler) throw new Error("expected services handler")

    await expect(
      Effect.runPromise(
        runPluginHandler(handler, {
          operation: CLAIMS_SEARCH_OPERATION,
          provider: provider.id,
          input: { query: "hello" },
          services,
        }),
      ),
    ).resolves.toEqual({
      provider: "@test:services",
      body: "hello from service",
    })
  })

  it("keeps plain, Promise-like, and Effect handler results compatible with services", async () => {
    const services: PluginServices = {
      time: { nowIso: () => "2026-07-03T00:00:00.000Z" },
    }
    const context = {
      operation: "test",
      provider: "@test:services",
      services,
    } satisfies PluginOperationContext<"test">

    await expect(
      Effect.runPromise(
        runPluginHandler(
          {
            id: "plain",
            operation: "test",
            run: input =>
              requirePluginService(
                input.services,
                "time",
                input.operation,
              ).nowIso?.(),
          },
          context,
        ),
      ),
    ).resolves.toBe("2026-07-03T00:00:00.000Z")

    await expect(
      Effect.runPromise(
        runPluginHandler(
          {
            id: "promise",
            operation: "test",
            run: input =>
              Promise.resolve(
                requirePluginService(
                  input.services,
                  "time",
                  input.operation,
                ).nowIso?.(),
              ),
          },
          context,
        ),
      ),
    ).resolves.toBe("2026-07-03T00:00:00.000Z")

    await expect(
      Effect.runPromise(
        runPluginHandler(
          {
            id: "effect",
            operation: "test",
            run: input =>
              Effect.succeed(
                requirePluginService(
                  input.services,
                  "time",
                  input.operation,
                ).nowIso?.(),
              ),
          },
          context,
        ),
      ),
    ).resolves.toBe("2026-07-03T00:00:00.000Z")
  })

  it("provides provider-scoped claim, download, and health builders", () => {
    const services = createProviderScopedPluginServices(
      { time: { nowIso: () => "2026-07-06T00:00:00.000Z" } },
      "@local:plain",
    )

    expect(
      services.claims?.claim?.({
        title: "Plain Game",
        url: "https://example.test/game",
        platform: "nes",
        fileName: "plain.zip",
      }),
    ).toMatchObject({
      _tag: "ProviderClaim",
      providerId: "@local:plain",
      id: encodeURIComponent("https://example.test/game"),
      artifact: {
        kind: "content",
        system: "nes",
        format: { id: "zip" },
        file: { name: "plain.zip", extension: "zip" },
      },
    })
    expect(
      services.downloads?.final?.({
        url: "https://example.test/plain.zip",
        filename: "plain.zip",
      }),
    ).toMatchObject({
      _tag: "FinalDownload",
      providerId: "@local:plain",
      url: "https://example.test/plain.zip",
    })
    expect(services.provider?.healthy?.()).toEqual({
      _tag: "HealthyProvider",
      providerId: "@local:plain",
      checkedAt: "2026-07-06T00:00:00.000Z",
    })
  })

  it("throws a plugin-service error when a required service is absent", () => {
    expect(() => requirePluginService({}, "http", "claims.search")).toThrow(
      "Plugin operation claims.search requires service http",
    )
  })
})
