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

  it("emits a playable release hint when the plugin maps a system", () => {
    const services = createProviderScopedPluginServices(
      { time: { nowIso: () => "2026-07-06T00:00:00.000Z" } },
      "@local:plain",
    )

    const claim = services.claims?.claim?.({
      title: "Plain Game",
      url: "https://example.test/game",
      platform: "super-nintendo",
      system: "snes",
      fileName: "plain.zip",
    })
    expect(claim).toMatchObject({
      _tag: "ProviderClaim",
      playable: {
        id: encodeURIComponent("https://example.test/game"),
        title: "Plain Game",
        providerId: "@local:plain",
        releases: [{ id: "snes", providerId: "@local:plain", system: "snes" }],
      },
      artifact: { system: "snes" },
    })

    const withoutSystem = services.claims?.claim?.({
      title: "Plain Game",
      url: "https://example.test/game",
      platform: "super-nintendo",
    }) as { playable?: unknown }
    expect(withoutSystem.playable).toBeUndefined()
  })

  it("throws a plugin-service error when a required service is absent", () => {
    expect(() => requirePluginService({}, "http", "claims.search")).toThrow(
      "Plugin operation claims.search requires service http",
    )
  })
})

describe("provider-scoped http session", () => {
  type Call = { url: string; headers: Record<string, string> }

  function fakeBaseHttp(responses: {
    readonly setCookiesByUrl?: Record<string, readonly string[]>
  }) {
    const calls: Call[] = []
    const request = async (
      url: string | URL,
      options?: { headers?: Readonly<Record<string, string>> },
    ) => {
      const target = String(url)
      calls.push({ url: target, headers: { ...(options?.headers ?? {}) } })
      return {
        status: 200,
        ok: true,
        url: target,
        headers: {},
        setCookies: responses.setCookiesByUrl?.[target] ?? [],
        text: async () => "body",
        json: async () => ({}) as never,
        bytes: async () => new Uint8Array(),
      }
    }
    return { calls, http: { request } }
  }

  it("carries Set-Cookie from one request into the next on the same host", async () => {
    const base = fakeBaseHttp({
      setCookiesByUrl: {
        "https://roms.test/game": ["session=s1; Path=/"],
      },
    })
    const services = createProviderScopedPluginServices(
      { http: base.http },
      "@local:roms",
    )

    await services.http!.request!("https://roms.test/game")
    await services.http!.request!("https://roms.test/download")

    expect(base.calls[1]?.headers["cookie"]).toBe("session=s1")
  })

  it("does not leak cookies to a different host", async () => {
    const base = fakeBaseHttp({
      setCookiesByUrl: {
        "https://roms.test/game": ["session=s1; Path=/"],
      },
    })
    const services = createProviderScopedPluginServices(
      { http: base.http },
      "@local:roms",
    )

    await services.http!.request!("https://roms.test/game")
    await services.http!.request!("https://other.test/download")

    expect(base.calls[1]?.headers["cookie"]).toBeUndefined()
  })

  it("keeps text and json sugar inside the same cookie session", async () => {
    const base = fakeBaseHttp({
      setCookiesByUrl: {
        "https://roms.test/game": ["session=s1; Path=/"],
      },
    })
    const services = createProviderScopedPluginServices(
      { http: base.http },
      "@local:roms",
    )

    await services.http!.text!("https://roms.test/game")
    await services.http!.text!("https://roms.test/page2")

    expect(base.calls[1]?.headers["cookie"]).toBe("session=s1")
  })

  it("embeds the session cookie into FinalDownload requestHeaders for the download URL", async () => {
    const base = fakeBaseHttp({
      setCookiesByUrl: {
        "https://roms.test/game": ["session=s1; Path=/"],
      },
    })
    const services = createProviderScopedPluginServices(
      { http: base.http },
      "@local:roms",
    )

    await services.http!.request!("https://roms.test/game")

    expect(
      services.downloads?.final?.({
        url: "https://roms.test/files/game.zip",
        requestHeaders: { referer: "https://roms.test/game" },
      }),
    ).toMatchObject({
      _tag: "FinalDownload",
      url: "https://roms.test/files/game.zip",
      requestHeaders: {
        referer: "https://roms.test/game",
        cookie: "session=s1",
      },
    })
  })

  it("omits requestHeaders entirely when there are no cookies or explicit headers", () => {
    const services = createProviderScopedPluginServices(
      { time: { nowIso: () => "2026-07-06T00:00:00.000Z" } },
      "@local:plain",
    )
    const final = services.downloads?.final?.({
      url: "https://example.test/plain.zip",
    }) as { requestHeaders?: unknown }
    expect(final.requestHeaders).toBeUndefined()
  })

  it("passes base http through unchanged when it has no capable request", async () => {
    const services = createProviderScopedPluginServices(
      { http: { text: async () => "legacy" } },
      "@local:legacy",
    )
    expect(await services.http!.text!("https://example.test")).toBe("legacy")
    expect(services.http!.request).toBeUndefined()
  })
})
