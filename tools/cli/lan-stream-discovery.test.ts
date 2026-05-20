import { describe, expect, it } from "bun:test"
import type { Service } from "bonjour-service"
import {
  type BonjourLike,
  type BrowserLike,
  candidateFromManualHost,
  candidateFromMdnsService,
  discoverStreamHosts,
} from "./lan-stream-discovery"

describe("LAN stream discovery", () => {
  it("normalizes manual hosts into stream candidates", () => {
    expect(candidateFromManualHost("aka.local:3010")).toMatchObject({
      id: "aka.local",
      name: "aka.local",
      controlUrl: "http://aka.local:3010",
      source: "manual",
      capabilities: ["stream"],
      identityVerified: false,
    })
  })

  it("derives mDNS control URL from service address and port", () => {
    const candidate = candidateFromMdnsService({
      name: "Korri on aka",
      host: "aka.local",
      port: 3010,
      addresses: ["192.168.1.50"],
      txt: {
        proto: "1",
        hostId: "aka",
        caps: "stream,file-sharing",
        controlUrl: "http://evil.example:9",
      },
    })

    expect(candidate).toMatchObject({
      id: "aka",
      name: "Korri on aka",
      controlUrl: "http://192.168.1.50:3010",
      source: "mdns",
      capabilities: ["stream", "file-sharing"],
      identityVerified: false,
    })
  })

  it("ignores non-local mDNS addresses", () => {
    expect(
      candidateFromMdnsService({
        name: "Fake Korri",
        host: "fake.local",
        port: 3010,
        addresses: ["8.8.8.8"],
        txt: { proto: "1" },
      }),
    ).toBeUndefined()
  })

  it("uses manual host fallback instead of mDNS browsing", async () => {
    const bonjour = createBonjourLike([])
    const candidates = await discoverStreamHosts({
      manualHost: "http://aka.local:3010",
      bonjourFactory: () => bonjour,
    })

    expect(candidates.map(candidate => candidate.controlUrl)).toEqual([
      "http://aka.local:3010",
    ])
    expect(bonjour.findCalls).toBe(0)
  })

  it("deduplicates discovered services by control URL", async () => {
    const bonjour = createBonjourLike([
      service("Korri A", "192.168.1.50", 3010),
      service("Korri A duplicate", "192.168.1.50", 3010),
    ])

    const candidates = await discoverStreamHosts({
      timeoutMs: 1,
      bonjourFactory: () => bonjour,
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.controlUrl).toBe("http://192.168.1.50:3010")
    expect(bonjour.stopped).toBe(true)
    expect(bonjour.destroyed).toBe(true)
  })
})

function service(name: string, address: string, port: number): Service {
  return {
    name,
    host: `${name}.local`,
    port,
    addresses: [address],
    txt: { proto: "1", hostId: name, caps: "stream" },
  } as Service
}

function createBonjourLike(services: readonly Service[]): BonjourLike & {
  findCalls: number
  stopped: boolean
  destroyed: boolean
} {
  const state = {
    findCalls: 0,
    stopped: false,
    destroyed: false,
  }
  return {
    get findCalls() {
      return state.findCalls
    },
    get stopped() {
      return state.stopped
    },
    get destroyed() {
      return state.destroyed
    },
    find: (_options, onup): BrowserLike => {
      state.findCalls += 1
      for (const found of services) onup(found)
      return {
        stop: () => {
          state.stopped = true
        },
      }
    },
    destroy: callback => {
      state.destroyed = true
      callback?.()
    },
  }
}
