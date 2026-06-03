import { describe, expect, it } from "bun:test"
import type { Service } from "bonjour-service"
import type {
  BonjourLike,
  BrowserLike,
} from "../../../product/apps/cli/lan-stream-discovery"
import { makeForwarderUpstream } from "./forwarder-upstream"

describe("ForwarderUpstream", () => {
  it("prefers the local loopback when /api/health responds", async () => {
    const upstream = makeForwarderUpstream({
      loopbackBaseUrl: "http://127.0.0.1:3001",
      probeLoopback: async () => true,
      bonjourFactory: () => createSilentBonjour(),
      cacheTtlMs: 0, // disabled for deterministic tests
    })

    const picked = await upstream.pickUpstream()
    await upstream.shutdown()
    expect(picked).toBe("http://127.0.0.1:3001")
  })

  it("falls back to the first mDNS peer with caps: source when loopback is dead", async () => {
    const bonjour = createBonjourWith([
      { name: "aka", address: "192.168.1.117", port: 3001, caps: "source" },
    ])
    const upstream = makeForwarderUpstream({
      loopbackBaseUrl: "http://127.0.0.1:3001",
      probeLoopback: async () => false,
      bonjourFactory: () => bonjour,
      cacheTtlMs: 0,
    })

    const picked = await upstream.pickUpstream()
    await upstream.shutdown()
    expect(picked).toBe("http://192.168.1.117:3001")
  })

  it("returns undefined when loopback is dead AND no mDNS peers advertise caps: source", async () => {
    const bonjour = createBonjourWith([
      // Stream-only peer (no `source` cap) \u2014 must be skipped.
      {
        name: "stream-only",
        address: "192.168.1.50",
        port: 3001,
        caps: "stream",
      },
    ])
    const upstream = makeForwarderUpstream({
      loopbackBaseUrl: "http://127.0.0.1:3001",
      probeLoopback: async () => false,
      bonjourFactory: () => bonjour,
      cacheTtlMs: 0,
    })

    const picked = await upstream.pickUpstream()
    await upstream.shutdown()
    expect(picked).toBeUndefined()
  })

  it("prefers loopback over mDNS peers (fast-path wins)", async () => {
    const bonjour = createBonjourWith([
      { name: "aka", address: "192.168.1.117", port: 3001, caps: "source" },
    ])
    const upstream = makeForwarderUpstream({
      loopbackBaseUrl: "http://127.0.0.1:3001",
      probeLoopback: async () => true,
      bonjourFactory: () => bonjour,
      cacheTtlMs: 0,
    })

    const picked = await upstream.pickUpstream()
    await upstream.shutdown()
    expect(picked).toBe("http://127.0.0.1:3001")
  })

  it("caches the picked upstream for the configured TTL", async () => {
    let probeCalls = 0
    const upstream = makeForwarderUpstream({
      loopbackBaseUrl: "http://127.0.0.1:3001",
      probeLoopback: async () => {
        probeCalls += 1
        return true
      },
      bonjourFactory: () => createSilentBonjour(),
      cacheTtlMs: 5000,
    })

    await upstream.pickUpstream()
    await upstream.pickUpstream()
    await upstream.pickUpstream()
    await upstream.shutdown()
    expect(probeCalls).toBe(1)
  })

  it("invalidate() forces a re-pick on the next call", async () => {
    let probeCalls = 0
    const upstream = makeForwarderUpstream({
      loopbackBaseUrl: "http://127.0.0.1:3001",
      probeLoopback: async () => {
        probeCalls += 1
        return true
      },
      bonjourFactory: () => createSilentBonjour(),
      cacheTtlMs: 5000,
    })

    await upstream.pickUpstream()
    expect(probeCalls).toBe(1)
    upstream.invalidate()
    await upstream.pickUpstream()
    await upstream.shutdown()
    expect(probeCalls).toBe(2)
  })

  it("re-picks after the TTL expires", async () => {
    let probeCalls = 0
    const upstream = makeForwarderUpstream({
      loopbackBaseUrl: "http://127.0.0.1:3001",
      probeLoopback: async () => {
        probeCalls += 1
        return true
      },
      bonjourFactory: () => createSilentBonjour(),
      cacheTtlMs: 10,
    })

    await upstream.pickUpstream()
    expect(probeCalls).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 25))
    await upstream.pickUpstream()
    await upstream.shutdown()
    expect(probeCalls).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Test fixtures: a controllable bonjour that emits its `up` events as soon
// as the first browser handler is registered. Matches the shape used in
// lan-stream-discovery.test.ts.
// ---------------------------------------------------------------------------

interface AdvertisedService {
  readonly name: string
  readonly address: string
  readonly port: number
  readonly caps: string
}

function createBonjourWith(
  services: readonly AdvertisedService[],
): BonjourLike {
  const pending: Service[] = services.map(
    s =>
      ({
        name: s.name,
        host: `${s.name}.local`,
        port: s.port,
        addresses: [s.address],
        txt: { proto: "1", hostId: s.name, caps: s.caps },
      }) as Service,
  )
  return {
    find: (_options, onup): BrowserLike => {
      const browser: BrowserLike = {
        start: () => {
          for (const svc of pending) onup(svc)
        },
        stop: () => {},
        on: (_event, _handler) => browser,
        off: (_event, _handler) => browser,
      }
      return browser
    },
    destroy: callback => callback?.(),
  }
}

function createSilentBonjour(): BonjourLike {
  return createBonjourWith([])
}
