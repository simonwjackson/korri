import { afterEach, describe, expect, it } from "bun:test"
import { MoonlightImplementation } from "@contracts/generated/korrid"
import {
  callKorrid,
  createHttpKorridClient,
  createInMemoryKorridClient,
} from "./client"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("callKorrid", () => {
  it("sends the per-server capability as a bearer token", async () => {
    let authorization: string | null = null
    globalThis.fetch = (async (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization")
      return new Response(
        JSON.stringify({
          _tag: "system.health",
          outcome: { _tag: "Ok", payload: { version: "test" } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    const response = await callKorrid(
      "http://127.0.0.1:43117",
      "secret-capability",
      { _tag: "system.health", payload: {} },
    )

    if (authorization !== "Bearer secret-capability") {
      throw new Error(`unexpected authorization header: ${authorization}`)
    }
    expect(response._tag).toBe("system.health")
  })

  it("serializes the host-qualified prepare payload", async () => {
    let body: unknown
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          _tag: "app.session.prepare",
          outcome: { _tag: "Ok", payload: { gameId: "neverball" } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    await createHttpKorridClient(
      "http://127.0.0.1:43117",
      "capability",
    ).sessionPrepare("neverball", "zao")

    expect(body).toEqual({
      _tag: "app.session.prepare",
      payload: { gameId: "neverball", host: "zao" },
    })
  })

  it("requests typed Moonlight resolution from korrid", async () => {
    let body: unknown
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          _tag: "app.moonlight.resolve",
          outcome: {
            _tag: "Available",
            payload: {
              transportId: "@korri:moonlight/moonlight",
              implementation: "artemis",
              sunshineApp: "Korri Stream",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    const outcome = await createHttpKorridClient(
      "http://127.0.0.1:43117",
      "capability",
    ).moonlightResolve()

    expect(body).toEqual({ _tag: "app.moonlight.resolve", payload: {} })
    expect(outcome).toMatchObject({
      _tag: "Available",
      payload: { implementation: "artemis" },
    })
  })

  it("aborts session status at its UI deadline", async () => {
    globalThis.fetch = ((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
      })) as typeof fetch

    const outcome = await createHttpKorridClient(
      "http://127.0.0.1:43117",
      "capability",
    ).sessionStatus(1)

    expect(outcome).toEqual({
      _tag: "Err",
      payload: {
        code: "StatusTimeout",
        message: "session status timed out",
      },
    })
  })

  it("aborts a stalled RPC at its deadline", async () => {
    globalThis.fetch = ((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
      })) as typeof fetch

    let error: unknown
    try {
      await callKorrid(
        "http://127.0.0.1:43117",
        "capability",
        { _tag: "system.health", payload: {} },
        1,
      )
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(DOMException)
    expect((error as DOMException).name).toBe("TimeoutError")
  })
})

describe("in-memory Moonlight policy", () => {
  it("keeps normal explicit user disable semantics", async () => {
    const client = createInMemoryKorridClient({
      moonlight: {
        _tag: "Available",
        payload: {
          transportId: "@fixture:moonlight/transport",
          implementation: MoonlightImplementation.Artemis,
          sunshineApp: "Fixture stream",
        },
      },
    })
    const settings = await client.settingsSnapshot()
    if (settings._tag !== "Ok") throw new Error("expected settings")

    expect((await client.moonlightResolve())._tag).toBe("Available")
    await client.updateSetting(
      settings.payload.revision,
      "@korri:moonlight",
      "false",
    )
    expect(await client.moonlightResolve()).toMatchObject({
      _tag: "Unavailable",
      payload: { code: "MoonlightUnavailable" },
    })
  })
})

describe("local games", () => {
  it("does not manufacture plugin-owned local routes by default", async () => {
    const client = createInMemoryKorridClient()
    expect(await client.localGames()).toEqual({
      _tag: "Ok",
      payload: { games: [] },
    })
    expect(await client.localGameLaunch("wl4")).toMatchObject({
      _tag: "Err",
      payload: { code: "LocalRomMissing" },
    })
  })

  it("returns caller-provided local launch instructions unchanged", async () => {
    const spec = {
      launchId: "fixture-launch",
      launcherId: "fixture-launcher",
      component: { packageName: "dev.fixture.runtime", className: "dev.fixture.Main" },
      extras: { CONTENT: "/fixture/game.bin" },
      directories: [],
      files: [],
      integrity: "fixture-integrity",
    }
    const client = createInMemoryKorridClient({
      localGames: [{ id: "fixture", title: "Fixture", system: "Test" }],
      localLaunchSpecs: { fixture: spec },
    })

    expect(await client.localGameLaunch("fixture")).toEqual({
      _tag: "Ok",
      payload: spec,
    })
  })

  it("keeps healthy local games beside local configuration failures", async () => {
    const client = createInMemoryKorridClient({
      localGames: [
        { id: "wl4", title: "Wario Land 4", system: "Game Boy Advance" },
      ],
      localFailures: [
        {
          code: "LocalConfigReloadFailed",
          message: "library.yaml is malformed",
        },
      ],
    })

    expect(await client.localGames()).toEqual({
      _tag: "Ok",
      payload: {
        games: [
          { id: "wl4", title: "Wario Land 4", system: "Game Boy Advance" },
        ],
        failures: [
          {
            code: "LocalConfigReloadFailed",
            message: "library.yaml is malformed",
          },
        ],
      },
    })
  })
})
