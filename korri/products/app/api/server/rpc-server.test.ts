import { describe, expect, it } from "bun:test"
import { appRpcGroup } from "../app-rpc-group"
import { createHonoApp } from "../hono-app"
import { serverRpcGroup } from "./rpc-group"
import { serverRpcHandler } from "./rpc-server"

describe("headless server RPC group", () => {
  it("exposes the reduced headless control-plane surface", () => {
    const tags = Array.from(serverRpcGroup.requests.keys()).sort()

    expect(tags).toEqual([
      "app.hello.get",
      "app.server.status",
      "app.server.stream.prepare",
      "app.source.list",
      "app.source.status",
      "app.stream.prepare",
    ])
  })

  it("rejects non-json posts on the headless server RPC surface", async () => {
    const app = createHonoApp({
      rpcHandler: serverRpcHandler,
      rpcSurface: "server",
    })

    const response = await app.request("/api/rpc", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    })

    expect(response.status).toBe(415)
  })

  it("does not expose app-local full library or local launch RPCs", () => {
    const serverTags = Array.from(serverRpcGroup.requests.keys())
    const appTags = Array.from(appRpcGroup.requests.keys())

    expect(appTags).toContain("app.library.list")
    expect(appTags).toContain("app.library.launch")
    expect(serverTags).not.toContain("app.library.list")
    expect(serverTags).not.toContain("app.library.launch")
  })
})
