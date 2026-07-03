import { describe, expect, it } from "bun:test"
import {
  type BonjourLike,
  type BrowserLike,
  candidateFromManualHost,
  candidateFromMdnsService,
  discoverStreamHosts,
  type StreamHostEvent,
  watchStreamHosts,
} from "./lan-stream-discovery"
import type { Service } from "bonjour-service"
import { Effect, Stream } from "effect"

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

  it("defaults the manual host port to the Korri stream port when none is given", () => {
    // Without an explicit port the CLI would otherwise build
    // `http://aka` (port 80) and hit whatever runs there, surfacing a
    // confusing `HttpError:` with an empty body. Default to 3001 so a
    // bare `--host aka` works the same as `--host aka:3001` and matches
    // what mDNS advertises.
    expect(candidateFromManualHost("aka")).toMatchObject({
      id: "aka",
      name: "aka",
      controlUrl: "http://aka:3001",
      source: "manual",
    })
    expect(candidateFromManualHost("http://aka")).toMatchObject({
      controlUrl: "http://aka:3001",
    })
    expect(candidateFromManualHost("https://aka.example.com")).toMatchObject({
      controlUrl: "https://aka.example.com:3001",
    })
  })

  it("keeps an explicit manual-host port untouched", () => {
    expect(candidateFromManualHost("aka:9999")).toMatchObject({
      controlUrl: "http://aka:9999",
    })
  })

  it("derives mDNS control URL from the advertised host name and port", () => {
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
      // resolvable device name, not the LAN IP, so the peer is reachable
      // wherever the name resolves (LAN DNS/mDNS, Tailscale MagicDNS, ...)
      controlUrl: "http://aka:3010",
      source: "mdns",
      capabilities: ["stream", "file-sharing"],
      identityVerified: false,
    })
  })

  it("falls back to the .local host when no hostId is advertised", () => {
    expect(
      candidateFromMdnsService({
        name: "Korri on aka",
        host: "aka.local.",
        port: 3010,
        addresses: ["192.168.1.50"],
        txt: { proto: "1", caps: "source" },
      }),
    ).toMatchObject({ controlUrl: "http://aka.local:3010" })
  })

  it("falls back to the LAN address when the advertised name is not a usable hostname", () => {
    expect(
      candidateFromMdnsService({
        name: "Korri Living Room",
        host: "Korri Living Room.local",
        port: 3010,
        addresses: ["192.168.1.50"],
        txt: { proto: "1", hostId: "Korri Living Room", caps: "source" },
      }),
    ).toMatchObject({ controlUrl: "http://192.168.1.50:3010" })
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

  it("keeps multiple discovered compatible servers as generic candidates", async () => {
    const bonjour = createBonjourLike([
      service("Korri Living Room", "192.168.1.50", 3010),
      service("Korri Office", "192.168.1.51", 3010),
    ])

    const candidates = await discoverStreamHosts({
      timeoutMs: 1,
      bonjourFactory: () => bonjour,
    })

    expect(candidates.map(candidate => candidate.name)).toEqual([
      "Korri Living Room",
      "Korri Office",
    ])
    expect(candidates.map(candidate => candidate.controlUrl)).toEqual([
      "http://192.168.1.50:3010",
      "http://192.168.1.51:3010",
    ])
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

interface ControllableBonjour extends BonjourLike {
  emitUp(service: Service): void
  emitDown(service: Service): void
  readonly started: number
  readonly stopped: boolean
  readonly destroyed: boolean
}

/**
 * Bonjour fake that buffers up/down emissions until a handler is registered
 * via `find()` + `browser.on("down", ...)`, then flushes them synchronously.
 */
function createControllableBonjour(): ControllableBonjour {
  const state = {
    started: 0,
    stopped: false,
    destroyed: false,
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
    get started() {
      return state.started
    },
    get stopped() {
      return state.stopped
    },
    get destroyed() {
      return state.destroyed
    },
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
          state.started += 1
          flush()
        },
        stop: () => {
          state.stopped = true
        },
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
      state.destroyed = true
      callback?.()
    },
  }
  return bonjour
}

function collectStream<A>(
  stream: Stream.Stream<A>,
  take: number,
  timeoutMs = 200,
): Effect.Effect<readonly A[]> {
  return stream.pipe(
    Stream.take(take),
    Stream.interruptWhen(Effect.sleep(`${timeoutMs} millis`)),
    Stream.runCollect,
    Effect.scoped,
  )
}

describe("watchStreamHosts", () => {
  it("emits an appear event when a service becomes available", async () => {
    const bonjour = createControllableBonjour()
    bonjour.emitUp(service("Korri A", "192.168.1.50", 3010))

    const events = await Effect.runPromise(
      collectStream(watchStreamHosts({ bonjourFactory: () => bonjour }), 1),
    )

    expect(events).toHaveLength(1)
    const [first] = events
    expect(first?.kind).toBe("appear")
    if (first?.kind === "appear") {
      expect(first.candidate.controlUrl).toBe("http://192.168.1.50:3010")
      expect(first.candidate.id).toBe("Korri A")
      expect(first.candidate.capabilities).toEqual(["stream"])
    }
  })

  it("emits appear then disappear for the same service", async () => {
    const bonjour = createControllableBonjour()
    const target = service("Korri A", "192.168.1.50", 3010)
    bonjour.emitUp(target)
    bonjour.emitDown(target)

    const events = await Effect.runPromise(
      collectStream(watchStreamHosts({ bonjourFactory: () => bonjour }), 2),
    )

    expect(events.map(e => e.kind)).toEqual(["appear", "disappear"])
    const second = events[1]
    if (second?.kind === "disappear") {
      expect(second.controlUrl).toBe("http://192.168.1.50:3010")
    }
  })

  it("emits appear events for two distinct services", async () => {
    const bonjour = createControllableBonjour()
    bonjour.emitUp(service("Korri A", "192.168.1.50", 3010))
    bonjour.emitUp(service("Korri B", "192.168.1.51", 3010))

    const events = await Effect.runPromise(
      collectStream(watchStreamHosts({ bonjourFactory: () => bonjour }), 2),
    )

    const urls = events
      .filter(
        (e): e is Extract<StreamHostEvent, { kind: "appear" }> =>
          e.kind === "appear",
      )
      .map(e => e.candidate.controlUrl)
    expect(urls.sort()).toEqual([
      "http://192.168.1.50:3010",
      "http://192.168.1.51:3010",
    ])
  })

  it("deduplicates appear events for the same controlUrl (TTL refresh)", async () => {
    const bonjour = createControllableBonjour()
    const target = service("Korri A", "192.168.1.50", 3010)
    bonjour.emitUp(target)
    bonjour.emitUp(target)

    const events = await Effect.runPromise(
      collectStream(
        watchStreamHosts({ bonjourFactory: () => bonjour }),
        2,
        100,
      ),
    )

    expect(events.filter(e => e.kind === "appear")).toHaveLength(1)
  })

  it("does not emit disappear when no prior appear was emitted", async () => {
    const bonjour = createControllableBonjour()
    const ghost = service("Korri Ghost", "192.168.1.99", 3010)
    bonjour.emitDown(ghost)

    const events = await Effect.runPromise(
      collectStream(watchStreamHosts({ bonjourFactory: () => bonjour }), 1, 50),
    )

    expect(events).toHaveLength(0)
  })

  it("filters services with malformed TXT records", async () => {
    const bonjour = createControllableBonjour()
    bonjour.emitUp({
      name: "Bad service",
      host: "bad.local",
      port: 3010,
      addresses: ["8.8.8.8"],
      txt: { proto: "1" },
    } as Service)

    const events = await Effect.runPromise(
      collectStream(
        watchStreamHosts({ bonjourFactory: () => bonjour }),
        1,
        100,
      ),
    )

    expect(events).toHaveLength(0)
  })

  it("cleans up the bonjour browser on scope close", async () => {
    const bonjour = createControllableBonjour()
    await Effect.runPromise(
      collectStream(watchStreamHosts({ bonjourFactory: () => bonjour }), 1, 50),
    )

    expect(bonjour.started).toBe(1)
    expect(bonjour.stopped).toBe(true)
    expect(bonjour.destroyed).toBe(true)
  })
})

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
