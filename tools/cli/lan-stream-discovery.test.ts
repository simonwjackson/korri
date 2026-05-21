import { describe, expect, it } from "bun:test"
import type { Service } from "bonjour-service"
import { Effect, Stream } from "effect"
import {
  type BonjourLike,
  type BrowserLike,
  candidateFromManualHost,
  candidateFromMdnsService,
  discoverStreamHosts,
  type StreamHostEvent,
  watchStreamHosts,
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

interface ControllableBonjour extends BonjourLike {
  emitUp(service: Service): void
  emitDown(service: Service): void
  readonly started: number
  readonly stopped: boolean
  readonly destroyed: boolean
}

function createControllableBonjour(): ControllableBonjour {
  const state = {
    started: 0,
    stopped: false,
    destroyed: false,
    upHandler: undefined as ((service: Service) => void) | undefined,
    downHandler: undefined as ((service: Service) => void) | undefined,
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
      state.upHandler?.(service)
    },
    emitDown(service) {
      state.downHandler?.(service)
    },
    find: (_options, onup): BrowserLike => {
      state.upHandler = onup
      const browser: BrowserLike = {
        start: () => {
          state.started += 1
        },
        stop: () => {
          state.stopped = true
        },
        on: (event, handler) => {
          if (event === "down")
            state.downHandler = handler as (service: Service) => void
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

describe("watchStreamHosts", () => {
  it("emits an appear event when a service becomes available", async () => {
    const bonjour = createControllableBonjour()
    const events = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stream = watchStreamHosts({ bonjourFactory: () => bonjour })
          const fiber = yield* Effect.forkChild(
            stream.pipe(Stream.take(1), Stream.runCollect),
          )
          yield* Effect.sync(() => {
            bonjour.emitUp(service("Korri A", "192.168.1.50", 3010))
          })
          return yield* fiber
        }),
      ),
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
    const events: StreamHostEvent[] = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stream = watchStreamHosts({ bonjourFactory: () => bonjour })
          const fiber = yield* Effect.forkChild(
            stream.pipe(Stream.take(2), Stream.runCollect),
          )
          yield* Effect.sync(() => {
            bonjour.emitUp(target)
            bonjour.emitDown(target)
          })
          return yield* fiber
        }),
      ),
    )

    expect(events.map(e => e.kind)).toEqual(["appear", "disappear"])
    const second = events[1]
    if (second?.kind === "disappear") {
      expect(second.controlUrl).toBe("http://192.168.1.50:3010")
    }
  })

  it("emits appear events for two distinct services", async () => {
    const bonjour = createControllableBonjour()
    const events = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stream = watchStreamHosts({ bonjourFactory: () => bonjour })
          const fiber = yield* Effect.forkChild(
            stream.pipe(Stream.take(2), Stream.runCollect),
          )
          yield* Effect.sync(() => {
            bonjour.emitUp(service("Korri A", "192.168.1.50", 3010))
            bonjour.emitUp(service("Korri B", "192.168.1.51", 3010))
          })
          return yield* fiber
        }),
      ),
    )

    const urls = events
      .filter((e): e is Extract<StreamHostEvent, { kind: "appear" }> => e.kind === "appear")
      .map(e => e.candidate.controlUrl)
    expect(urls.sort()).toEqual([
      "http://192.168.1.50:3010",
      "http://192.168.1.51:3010",
    ])
  })

  it("deduplicates appear events for the same controlUrl (TTL refresh)", async () => {
    const bonjour = createControllableBonjour()
    const target = service("Korri A", "192.168.1.50", 3010)
    const events = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stream = watchStreamHosts({ bonjourFactory: () => bonjour })
          const fiber = yield* Effect.forkChild(
            stream.pipe(
              Stream.take(2),
              Stream.runCollect,
              Effect.timeout("100 millis"),
              Effect.orElse(() =>
                stream.pipe(Stream.take(1), Stream.runCollect),
              ),
            ),
          )
          yield* Effect.sync(() => {
            bonjour.emitUp(target)
            bonjour.emitUp(target)
          })
          return yield* fiber
        }),
      ),
    )

    expect(events.filter(e => e.kind === "appear")).toHaveLength(1)
  })

  it("does not emit disappear when no prior appear was emitted", async () => {
    const bonjour = createControllableBonjour()
    const target = service("Korri Ghost", "192.168.1.99", 3010)
    const events = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stream = watchStreamHosts({ bonjourFactory: () => bonjour })
          const fiber = yield* Effect.forkChild(
            stream.pipe(
              Stream.take(1),
              Stream.runCollect,
              Effect.timeout("50 millis"),
              Effect.orElseSucceed(() => [] as readonly StreamHostEvent[]),
            ),
          )
          yield* Effect.sync(() => {
            bonjour.emitDown(target)
          })
          return yield* fiber
        }),
      ),
    )

    expect(events).toHaveLength(0)
  })

  it("filters services with malformed TXT records", async () => {
    const bonjour = createControllableBonjour()
    const events = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stream = watchStreamHosts({ bonjourFactory: () => bonjour })
          const fiber = yield* Effect.forkChild(
            stream.pipe(
              Stream.take(1),
              Stream.runCollect,
              Effect.timeout("100 millis"),
              Effect.orElseSucceed(() => [] as readonly StreamHostEvent[]),
            ),
          )
          yield* Effect.sync(() => {
            bonjour.emitUp({
              name: "Bad service",
              host: "bad.local",
              port: 3010,
              addresses: ["8.8.8.8"],
              txt: { proto: "1" },
            } as Service)
          })
          return yield* fiber
        }),
      ),
    )

    expect(events).toHaveLength(0)
  })

  it("cleans up the bonjour browser on scope close", async () => {
    const bonjour = createControllableBonjour()
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stream = watchStreamHosts({ bonjourFactory: () => bonjour })
          const fiber = yield* Effect.forkChild(
            stream.pipe(
              Stream.take(1),
              Stream.runCollect,
              Effect.timeout("50 millis"),
              Effect.orElseSucceed(() => [] as readonly StreamHostEvent[]),
            ),
          )
          yield* fiber
        }),
      ),
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
