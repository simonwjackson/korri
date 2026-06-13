import { describe, expect, it } from "bun:test"
import { catalogPeerFromRecord, makeSelfCatalogPeer } from "./catalog-peer-state"

describe("catalog peer state", () => {
  it("represents self with the same catalog peer shape as remote peers", () => {
    const self = makeSelfCatalogPeer({
      env: {
        KORRI_STREAM_ADVERTISE_HOST_ID: "bandai",
        KORRI_PUBLIC_API_BASE_URL: "http://bandai:3001",
      },
      entryCount: 37,
      updatedAt: "2026-06-13T00:00:00.000Z",
    })
    const remote = catalogPeerFromRecord(
      {
        hostId: "aka",
        displayName: "aka",
        controlUrl: "http://aka:3001",
        caps: ["source"],
      },
      {
        status: "loading",
        entryCount: 0,
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    )

    expect(Object.keys(self).sort()).toEqual(Object.keys(remote).sort())
    expect(self).toMatchObject({
      hostId: "bandai",
      controlUrl: "http://bandai:3001",
      isLocal: true,
      status: "ready",
      entryCount: 37,
    })
    expect(remote).toMatchObject({
      hostId: "aka",
      controlUrl: "http://aka:3001",
      isLocal: false,
      status: "loading",
      entryCount: 0,
    })
  })

  it("records failed remote peer state without entries", () => {
    const failed = catalogPeerFromRecord(
      {
        hostId: "aka",
        displayName: "aka",
        controlUrl: "http://aka:3001",
        caps: ["source"],
      },
      {
        status: "failed",
        entryCount: 0,
        updatedAt: "2026-06-13T00:00:00.000Z",
        error: "connection refused",
      },
    )

    expect(failed).toMatchObject({
      status: "failed",
      error: "connection refused",
      entryCount: 0,
    })
  })
})
