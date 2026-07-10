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

  it("decodes release identity tags on catalog entries", () => {
    const decoded = Schema.decodeUnknownSync(CatalogSnapshotResponse)({
      entries: [
        entry("local/rom", {
          kind: "hash",
          value:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        }),
        entry("local/store", {
          kind: "provider",
          value: { provider: "@korri:steam", ref: "1029210" },
        }),
      ],
      peers: [peer("self", true, "ready")],
      generation: 42,
      updatedAt: "2026-06-13T00:00:00.000Z",
      health: {
        coordinatorReachable: true,
        self: "ready",
        loadingPeers: 0,
        readyPeers: 0,
        failedPeers: 0,
        generation: 42,
      },
    })

    expect(decoded.entries.map(item => item.releases[0]?.identity)).toEqual([
      {
        kind: "hash",
        value:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      {
        kind: "provider",
        value: { provider: "@korri:steam", ref: "1029210" },
      },
    ])
  })

  it("decodes play stats timestamps into Date values", () => {
    const decoded = Schema.decodeUnknownSync(CatalogSnapshotResponse)({
      entries: [
        {
          ...entry("local/recent"),
          playStats: {
            lastPlayed: "2026-07-07T04:42:08.376Z",
            playCount: 2,
            totalPlaytimeSeconds: 258,
          },
        },
      ],
      peers: [peer("self", true, "ready")],
      generation: 42,
      updatedAt: "2026-06-13T00:00:00.000Z",
      health: {
        coordinatorReachable: true,
        self: "ready",
        loadingPeers: 0,
        readyPeers: 0,
        failedPeers: 0,
        generation: 42,
      },
    })

    expect(decoded.entries[0]?.playStats?.lastPlayed).toBeInstanceOf(Date)
    expect(decoded.entries[0]?.playStats?.lastPlayed?.getTime()).toBe(
      new Date("2026-07-07T04:42:08.376Z").getTime(),
    )
  })

  it("decodes optional catalog availability facts", () => {
    const decoded = Schema.decodeUnknownSync(CatalogSnapshotResponse)({
      entries: [
        {
          ...entry("local/available"),
          availability: "local-launchable",
        },
      ],
      peers: [peer("self", true, "ready")],
      generation: 42,
      updatedAt: "2026-06-13T00:00:00.000Z",
      health: {
        coordinatorReachable: true,
        self: "ready",
        loadingPeers: 0,
        readyPeers: 0,
        failedPeers: 0,
        generation: 42,
      },
    })

    expect(decoded.entries[0]?.availability).toBe("local-launchable")
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

function entry(
  id: string,
  identity?:
    | {
        readonly kind: "hash"
        readonly value: string
      }
    | {
        readonly kind: "provider"
        readonly value: { readonly provider: string; readonly ref: string }
      },
) {
  return {
    id,
    itemId: id,
    title: "Stray",
    releases: [
      {
        id: "default",
        system: "steam",
        launchable: true,
        ...(identity ? { identity } : {}),
      },
    ],
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
