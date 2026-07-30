import { afterEach, describe, expect, it } from "bun:test"
import { callKorrid, createInMemoryKorridClient } from "./client"

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
