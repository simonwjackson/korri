import { describe, expect, it } from "bun:test"
import type { BonjourLike, BrowserLike } from "@app/peers/peer-discovery"
import {
  makePeerDiscoveryLayer,
  PeerDiscovery,
} from "@app/peers/peer-discovery"
import type { Service } from "bonjour-service"
import { Effect, Layer, SubscriptionRef } from "effect"

describe("PeerDiscovery", () => {
  it("collects peers advertising `caps: source`", async () => {
    const bonjour = createControllableBonjour()
    bonjour.emitUp(serviceWithCaps("aka", "192.168.1.117", 3001, "stream,source"))
    bonjour.emitUp(serviceWithCaps("sobo", "192.168.1.239", 3001, "source"))

    const peers = await runPeerDiscoveryThenCollect(bonjour, {
      until: snapshot => snapshot.length === 2,
    })

    expect(peers.map(p => p.hostId).sort()).toEqual(["aka", "sobo"])
    expect(peers.find(p => p.hostId === "aka")?.controlUrl).toBe(
      "http://192.168.1.117:3001",
    )
  })

  it("removes a peer on disappear", async () => {
    const bonjour = createControllableBonjour()
    const aka = serviceWithCaps("aka", "192.168.1.117", 3001, "stream,source")
    bonjour.emitUp(aka)
    bonjour.emitUp(serviceWithCaps("sobo", "192.168.1.239", 3001, "source"))
    bonjour.emitDown(aka)

    const peers = await runPeerDiscoveryThenCollect(bonjour, {
      until: snapshot => snapshot.length === 1 && snapshot[0]?.hostId === "sobo",
    })

    expect(peers.map(p => p.hostId)).toEqual(["sobo"])
  })

  it("filters out the local advertisement by hostId", async () => {
    const bonjour = createControllableBonjour()
    bonjour.emitUp(serviceWithCaps("self-host", "192.168.1.117", 3001, "source"))
    bonjour.emitUp(serviceWithCaps("peer-host", "192.168.1.239", 3001, "source"))

    const peers = await runPeerDiscoveryThenCollect(
      bonjour,
      { until: snapshot => snapshot.length === 1 },
      { localHostId: "self-host" },
    )

    expect(peers.map(p => p.hostId)).toEqual(["peer-host"])
  })

  it("excludes peers without caps: source (stream-only servers)", async () => {
    const bonjour = createControllableBonjour()
    bonjour.emitUp(serviceWithCaps("source-host", "192.168.1.50", 3001, "source"))
    bonjour.emitUp(
      serviceWithCaps("stream-only", "192.168.1.51", 3001, "stream"),
    )

    const peers = await runPeerDiscoveryThenCollect(bonjour, {
      until: snapshot =>
        snapshot.length === 1 && snapshot[0]?.hostId === "source-host",
      timeoutMs: 200,
    })

    expect(peers.map(p => p.hostId)).toEqual(["source-host"])
  })

  it("includes peers advertising both caps: source and caps: stream", async () => {
    const bonjour = createControllableBonjour()
    bonjour.emitUp(
      serviceWithCaps("hybrid", "192.168.1.50", 3001, "source,stream"),
    )

    const peers = await runPeerDiscoveryThenCollect(bonjour, {
      until: snapshot => snapshot.length === 1,
    })

    expect(peers[0]?.caps).toContain("source")
    expect(peers[0]?.caps).toContain("stream")
  })

  it("deduplicates repeated appear events for the same controlUrl", async () => {
    const bonjour = createControllableBonjour()
    const aka = serviceWithCaps("aka", "192.168.1.117", 3001, "source")
    bonjour.emitUp(aka)
    bonjour.emitUp(aka)

    const peers = await runPeerDiscoveryThenCollect(bonjour, {
      until: snapshot => snapshot.length === 1,
      // Allow the loop to settle without forcing > 1.
      timeoutMs: 150,
    })

    expect(peers).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Test harness: build a real PeerDiscovery layer wired to the controllable
// bonjour, then poll its peers SubscriptionRef until a predicate matches or a
// short timeout elapses. Avoids forcing a TestClock for what is effectively
// async event-loop coordination through Stream.runForEach.
// ---------------------------------------------------------------------------

interface CollectOptions {
  readonly until: (
    snapshot: ReturnType<typeof currentPeersOrEmpty>,
  ) => boolean
  readonly timeoutMs?: number
}

interface PeerDiscoveryLayerOptions {
  readonly localHostId?: string
}

async function runPeerDiscoveryThenCollect(
  bonjour: BonjourLike,
  collect: CollectOptions,
  layerOptions: PeerDiscoveryLayerOptions = {},
) {
  return await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const discovery = yield* PeerDiscovery
        const deadline = Date.now() + (collect.timeoutMs ?? 500)
        while (true) {
          const peers = yield* SubscriptionRef.get(discovery.peers)
          const snapshot = currentPeersOrEmpty(peers)
          if (collect.until(snapshot)) return snapshot
          if (Date.now() > deadline) return snapshot
          yield* Effect.sleep("5 millis")
        }
      }).pipe(
        Effect.provide(
          makePeerDiscoveryLayer({
            bonjourFactory: () => bonjour,
            ...(layerOptions.localHostId !== undefined
              ? { localHostId: layerOptions.localHostId }
              : {}),
          }),
        ),
      ),
    ),
  )
}

function currentPeersOrEmpty(
  peers: ReadonlyMap<string, { hostId: string; controlUrl: string; caps: readonly string[] }>,
): readonly { hostId: string; controlUrl: string; caps: readonly string[] }[] {
  return Array.from(peers.values()).sort((a, b) =>
    a.hostId.localeCompare(b.hostId),
  )
}

function serviceWithCaps(
  name: string,
  address: string,
  port: number,
  caps: string,
): Service {
  return {
    name,
    host: `${name}.local`,
    port,
    addresses: [address],
    txt: { proto: "1", hostId: name, caps },
  } as Service
}

interface ControllableBonjour extends BonjourLike {
  emitUp(service: Service): void
  emitDown(service: Service): void
}

function createControllableBonjour(): ControllableBonjour {
  const state = {
    upHandler: undefined as ((service: Service) => void) | undefined,
    downHandler: undefined as ((service: Service) => void) | undefined,
    pending: [] as Array<{ kind: "up" | "down"; service: Service }>,
  }
  const flush = () => {
    if (!state.upHandler) return
    const queue = state.pending
    state.pending = []
    for (const event of queue) {
      if (event.kind === "up") state.upHandler?.(event.service)
      else state.downHandler?.(event.service)
    }
  }
  const bonjour: ControllableBonjour = {
    emitUp(service) {
      if (state.upHandler) state.upHandler(service)
      else state.pending.push({ kind: "up", service })
    },
    emitDown(service) {
      if (state.downHandler) state.downHandler(service)
      else state.pending.push({ kind: "down", service })
    },
    find: (_options, onup): BrowserLike => {
      state.upHandler = onup
      const browser: BrowserLike = {
        start: () => {
          flush()
        },
        stop: () => {},
        on: (event, handler) => {
          if (event === "down") {
            state.downHandler = handler as (service: Service) => void
            flush()
          }
          return browser
        },
        off: (event, _handler) => {
          if (event === "down") state.downHandler = undefined
          return browser
        },
      }
      return browser
    },
    destroy: callback => {
      callback?.()
    },
  }
  return bonjour
}
