import { describe, expect, it } from "bun:test"
import { createHonoApp } from "./hono-app"

describe("createHonoApp", () => {
  it("serves health without initializing the RPC handler", async () => {
    let rpcCalled = false
    const app = createHonoApp({
      rpcHandler: async () => {
        rpcCalled = true
        return new Response("unexpected", { status: 500 })
      },
    })

    const response = await app.request("/api/health")

    expect(response.status).toBe(200)
    expect((await response.json()) as { status: string }).toMatchObject({
      status: "ok",
    })
    expect(rpcCalled).toBe(false)
  })

  it("keeps malformed server RPC posts on the API route", async () => {
    const app = createHonoApp({
      rpcSurface: "server",
      rpcHandler: async () => new Response("unexpected", { status: 500 }),
    })

    const response = await app.request("/api/rpc", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    })

    expect(response.status).toBe(415)
    expect(await response.text()).toBe("Unsupported Media Type")
  })
})
