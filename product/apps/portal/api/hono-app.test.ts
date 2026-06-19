import { afterEach, describe, expect, it } from "bun:test"
import { createHonoApp } from "./hono-app"

const originalSecret = process.env.KORRI_INSTALL_CONTROL_SECRET

afterEach(() => {
  if (originalSecret === undefined) delete process.env.KORRI_INSTALL_CONTROL_SECRET
  else process.env.KORRI_INSTALL_CONTROL_SECRET = originalSecret
})

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

  it("creates install-control sessions with HttpOnly cookies", async () => {
    process.env.KORRI_INSTALL_CONTROL_SECRET = "long-install-secret"
    const app = createHonoApp()

    const response = await app.request("/api/install-control/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "long-install-secret" }),
    })

    expect(response.status).toBe(200)
    expect((await response.json()) as { ok: boolean }).toEqual({ ok: true })
  })

  it("rejects weak install-control secrets", async () => {
    process.env.KORRI_INSTALL_CONTROL_SECRET = "short"
    const app = createHonoApp()

    const response = await app.request("/api/install-control/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "short" }),
    })

    expect(response.status).toBe(404)
  })

  it("rejects invalid install-control sessions without a cookie", async () => {
    process.env.KORRI_INSTALL_CONTROL_SECRET = "long-install-secret"
    const app = createHonoApp()

    const response = await app.request("/api/install-control/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "wrong" }),
    })

    expect(response.status).toBe(401)
    expect(response.headers.get("set-cookie")).toBeNull()
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
