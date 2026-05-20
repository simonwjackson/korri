import { describe, expect, it } from "bun:test"
import { appRpcGroup } from "../app-rpc-group"
import { serverRpcGroup } from "./rpc-group"

describe("headless server RPC group", () => {
  it("exposes the reduced headless control-plane surface", () => {
    const tags = Array.from(serverRpcGroup.requests.keys()).sort()

    expect(tags).toEqual([
      "app.hello.get",
      "app.server.status",
      "app.server.stream.prepare",
      "app.source.list",
      "app.source.status",
    ])
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
