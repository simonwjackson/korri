import { afterEach, describe, expect, it } from "bun:test"
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

describe("local games", () => {
  it("serves a browser-dev Wario Land fixture and launch spec", async () => {
    const client = createInMemoryKorridClient()
    expect(await client.localGames()).toEqual({
      _tag: "Ok",
      payload: {
        games: [
          { id: "wl4", title: "Wario Land 4", system: "Game Boy Advance" },
        ],
      },
    })
    expect(await client.localGameLaunch("wl4")).toMatchObject({
      _tag: "Ok",
      payload: {
        launcherId: "retroarch",
        component: { packageName: "com.retroarch.aarch64" },
        extras: { ROM: "/browser-dev/korri-retro/roms/wl4.gba" },
      },
    })
  })
})
