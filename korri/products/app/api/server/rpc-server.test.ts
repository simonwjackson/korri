import { describe, expect, it } from "bun:test"
import { appRpcGroup } from "../app-rpc-group"
import { createHonoApp } from "../hono-app"
import { serverRpcGroup } from "./rpc-group"
import { serverRpcHandler } from "./rpc-server"

describe("headless server RPC group", () => {
  it("exposes the headless control-plane surface including library methods the renderer calls", () => {
    const tags = Array.from(serverRpcGroup.requests.keys()).sort()

    expect(tags).toEqual([
      "app.gameAssets.assign",
      "app.gameAssets.candidates.list",
      "app.gameAssets.unassign",
      "app.hello.get",
      "app.library.launch",
      "app.library.list",
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

  it("exposes library methods on both surfaces so the desktop client can drive them via the system server", () => {
    const serverTags = Array.from(serverRpcGroup.requests.keys())
    const appTags = Array.from(appRpcGroup.requests.keys())

    expect(appTags).toContain("app.library.list")
    expect(appTags).toContain("app.library.launch")
    expect(appTags).toContain("app.gameAssets.candidates.list")
    expect(appTags).toContain("app.gameAssets.assign")
    expect(appTags).toContain("app.gameAssets.unassign")
    expect(serverTags).toContain("app.library.list")
    expect(serverTags).toContain("app.library.launch")
    expect(serverTags).toContain("app.gameAssets.candidates.list")
    expect(serverTags).toContain("app.gameAssets.assign")
    expect(serverTags).toContain("app.gameAssets.unassign")
  })
})
