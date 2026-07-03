import { describe, expect, it } from "bun:test"
import type { StreamHostCandidate } from "@platform/stream/lan-stream-discovery"
import { errorMessage, remoteClientFor } from "./cli-helpers"
import type { RemoteStreamControlClient } from "./remote-stream-control-client"

describe("errorMessage", () => {
  it("returns the message for an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
  })

  it("returns a string value unchanged", () => {
    expect(errorMessage("plain")).toBe("plain")
  })

  it("stringifies other values", () => {
    expect(errorMessage(42)).toBe("42")
    expect(errorMessage({ toString: () => "obj" })).toBe("obj")
  })
})

describe("remoteClientFor", () => {
  const host: StreamHostCandidate = {
    id: "attic",
    name: "Attic",
    controlUrl: "http://attic:3000",
  } as StreamHostCandidate

  it("uses the injected override when provided", () => {
    const injected = {} as RemoteStreamControlClient
    const client = remoteClientFor(host, () => injected)
    expect(client).toBe(injected)
  })

  it("passes the host to the override", () => {
    let seen: StreamHostCandidate | undefined
    remoteClientFor(host, h => {
      seen = h
      return {} as RemoteStreamControlClient
    })
    expect(seen).toBe(host)
  })

  it("falls back to a real client when no override is given", () => {
    const client = remoteClientFor(host)
    expect(client).toBeDefined()
    expect(typeof client.sourceStatus).toBe("function")
  })
})
