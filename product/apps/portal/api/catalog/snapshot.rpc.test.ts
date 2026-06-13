import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import { CatalogSnapshotPayload, CatalogSnapshotResponse } from "./snapshot.rpc"

describe("CatalogSnapshot RPC schema", () => {
  it("decodes full fabric catalog facts", () => {
    const decoded = Schema.decodeUnknownSync(CatalogSnapshotResponse)({
      entries: [entry("local/stray")],
      peers: [peer("self", true, "ready"), peer("aka", false, "failed")],
      generation: 42,
      updatedAt: "2026-06-13T00:00:00.000Z",
      health: {
        coordinatorReachable: true,
        self: "ready",
        loadingPeers: 0,
        readyPeers: 0,
        failedPeers: 1,
        lastFailure: "timed out",
        generation: 42,
      },
    })

    expect(decoded.entries[0]?.source.isLocal).toBe(true)
    expect(decoded.peers.map(peer => peer.status)).toEqual(["ready", "failed"])
  })

  it("decodes self-only payloads", () => {
    expect(
      Schema.decodeUnknownSync(CatalogSnapshotPayload)({ scope: "self" }),
    ).toEqual({
      scope: "self",
    })
  })

  it("rejects payloads without an explicit scope", () => {
    expect(() => Schema.decodeUnknownSync(CatalogSnapshotPayload)({})).toThrow()
  })

  it("accepts ready empty self catalog facts", () => {
    const decoded = Schema.decodeUnknownSync(CatalogSnapshotResponse)({
      entries: [],
      peers: [peer("self", true, "ready")],
      generation: 1,
      updatedAt: "2026-06-13T00:00:00.000Z",
      health: {
        coordinatorReachable: true,
        self: "ready",
        loadingPeers: 0,
        readyPeers: 0,
        failedPeers: 0,
        generation: 1,
      },
    })

    expect(decoded.health.self).toBe("ready")
    expect(decoded.entries).toEqual([])
  })

  it("accepts sanitized failed self facts without entries", () => {
    const decoded = Schema.decodeUnknownSync(CatalogSnapshotResponse)({
      entries: [],
      peers: [peer("self", true, "failed", "read failed")],
      generation: 1,
      updatedAt: "2026-06-13T00:00:00.000Z",
      health: {
        coordinatorReachable: true,
        self: "failed",
        loadingPeers: 0,
        readyPeers: 0,
        failedPeers: 0,
        generation: 1,
      },
    })

    expect(decoded.peers[0]?.error).toBe("read failed")
  })
})

function entry(id: string) {
  return {
    id,
    itemId: id,
    title: "Stray",
    releases: [{ id: "default", system: "steam", launchable: true }],
    launchable: true,
    metadata: { name: "Stray" },
    source: {
      hostId: "self",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    },
  }
}

function peer(
  hostId: string,
  isLocal: boolean,
  status: "loading" | "ready" | "failed",
  error?: string,
) {
  return {
    hostId,
    displayName: hostId,
    controlUrl: `http://${hostId}:3001`,
    isLocal,
    caps: ["source"],
    status,
    entryCount: 0,
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...(error ? { error } : {}),
  }
}
