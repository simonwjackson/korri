import { describe, expect, it } from "bun:test"
import { Effect, Queue, type Scope, Stream, SubscriptionRef } from "effect"
import { TestClock } from "effect/testing"
import type {
  StreamHostCandidate,
  StreamHostEvent,
} from "../../../tools/cli/lan-stream-discovery"
import {
  type ConnectionState,
  makeConnectionController,
  type ServerRecord,
} from "./connection"
import type { DesktopConfig } from "./desktop-config"

const SERVER_A: ServerRecord = {
  hostId: "aka",
  controlUrl: "http://192.168.1.50:3010",
}

const SERVER_B: ServerRecord = {
  hostId: "kara",
  controlUrl: "http://192.168.1.51:3010",
}

function candidate(server: ServerRecord): StreamHostCandidate {
  return {
    id: server.hostId,
    name: server.hostId,
    controlUrl: server.controlUrl,
    source: "mdns",
    capabilities: ["stream"],
    identityVerified: false,
  }
}

interface TestRig {
  readonly emit: (event: StreamHostEvent) => Effect.Effect<void>
  readonly events: Queue.Queue<StreamHostEvent>
  readonly stream: Stream.Stream<StreamHostEvent>
}

function makeRig(): Effect.Effect<TestRig> {
  return Effect.gen(function* () {
    const events = yield* Queue.unbounded<StreamHostEvent>()
    const stream = Stream.fromQueue(events)
    return {
      events,
      stream,
      emit: event => Queue.offer(events, event),
    }
  })
}

interface ConfigRig {
  readonly loadConfig: Effect.Effect<DesktopConfig>
  readonly saveConfig: (partial: Partial<DesktopConfig>) => Effect.Effect<void>
  readonly saved: () => readonly Partial<DesktopConfig>[]
  readonly setInitial: (config: DesktopConfig) => void
}

function makeConfigRig(initial: DesktopConfig = {}): ConfigRig {
  let stored: DesktopConfig = initial
  const saves: Partial<DesktopConfig>[] = []
  return {
    loadConfig: Effect.sync(() => stored),
    saveConfig: partial =>
      Effect.sync(() => {
        saves.push(partial)
        stored = { ...stored, ...partial } as DesktopConfig
      }),
    saved: () => saves,
    setInitial: cfg => {
      stored = cfg
    },
  }
}

function makeProbe(
  outcomes: ReadonlyMap<string, boolean>,
  failOnUnknown = false,
): (controlUrl: string) => Effect.Effect<boolean> {
  return controlUrl =>
    Effect.sync(() => {
      if (outcomes.has(controlUrl)) return outcomes.get(controlUrl) ?? false
      return !failOnUnknown
    })
}

/**
 * Test probe that returns a per-URL sequence of outcomes, one per call.
 * After the sequence is exhausted, the last value is repeated. URLs not
 * declared in the map use the `fallback` value (defaults to true so unrelated
 * candidates don't accidentally short-circuit the controller).
 */
function makeSequentialProbe(
  sequences: ReadonlyMap<string, ReadonlyArray<boolean>>,
  fallback = true,
): (controlUrl: string) => Effect.Effect<boolean> {
  const counts = new Map<string, number>()
  return controlUrl =>
    Effect.sync(() => {
      const seq = sequences.get(controlUrl)
      if (!seq || seq.length === 0) return fallback
      const i = counts.get(controlUrl) ?? 0
      counts.set(controlUrl, i + 1)
      return seq[Math.min(i, seq.length - 1)] ?? fallback
    })
}

async function runTest<A>(
  effect: Effect.Effect<A, never, Scope.Scope>,
): Promise<A> {
  return Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(TestClock.layer()),
    ) as Effect.Effect<A, never, never>,
  )
}

describe("connection controller", () => {
  it("starts in searching when no remembered server", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({})
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(new Map()),
        })
        return yield* SubscriptionRef.get(controller.state)
      }),
    )

    expect(result.status).toBe("searching")
  })

  it("starts in reconnecting when a remembered server is present", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({ lastConnectedServer: SERVER_A })
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(new Map()),
        })
        return yield* SubscriptionRef.get(controller.state)
      }),
    )

    expect(result.status).toBe("reconnecting")
    if (result.status === "reconnecting") {
      expect(result.server).toEqual(SERVER_A)
    }
  })

  it("treats multiple generic server candidates with the existing first-healthy rule", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({})
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(
            new Map([
              [SERVER_A.controlUrl, true],
              [SERVER_B.controlUrl, true],
            ]),
          ),
        })
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_A) })
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_B) })
        yield* TestClock.adjust("5 seconds")
        const state = yield* SubscriptionRef.get(controller.state)
        return { state, saved: config.saved() }
      }),
    )

    expect(result.state.status).toBe("connected")
    if (result.state.status === "connected") {
      expect(result.state.server).toEqual(SERVER_A)
    }
    expect(result.saved).toEqual([{ lastConnectedServer: SERVER_A }])
  })

  it("connects to the first appeared candidate when no remembered server", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({})
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(new Map([[SERVER_A.controlUrl, true]])),
        })
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_A) })
        yield* TestClock.adjust("5 seconds")
        const state = yield* SubscriptionRef.get(controller.state)
        return { state, saved: config.saved() }
      }),
    )

    expect(result.state.status).toBe("connected")
    if (result.state.status === "connected") {
      expect(result.state.server).toEqual(SERVER_A)
    }
    expect(result.saved).toEqual([{ lastConnectedServer: SERVER_A }])
  })

  it("prefers the remembered server when it appears within the window", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({ lastConnectedServer: SERVER_A })
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(
            new Map([
              [SERVER_A.controlUrl, true],
              [SERVER_B.controlUrl, true],
            ]),
          ),
        })
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_B) })
        yield* TestClock.adjust("200 millis")
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_A) })
        yield* TestClock.adjust("5 seconds")
        const state = yield* SubscriptionRef.get(controller.state)
        return state
      }),
    )

    expect(result.status).toBe("connected")
    if (result.status === "connected") {
      expect(result.server).toEqual(SERVER_A)
    }
  })

  it("falls through to a non-remembered candidate after the window expires", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({ lastConnectedServer: SERVER_A })
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          // Remembered SERVER_A is unreachable; SERVER_B is reachable.
          httpProbe: makeProbe(
            new Map([
              [SERVER_A.controlUrl, false],
              [SERVER_B.controlUrl, true],
            ]),
          ),
        })
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_B) })
        yield* TestClock.adjust("2 seconds")
        const state = yield* SubscriptionRef.get(controller.state)
        return { state, saved: config.saved() }
      }),
    )

    expect(result.state.status).toBe("connected")
    if (result.state.status === "connected") {
      expect(result.state.server).toEqual(SERVER_B)
    }
    expect(result.saved).toEqual([{ lastConnectedServer: SERVER_B }])
  })

  it("transitions reconnecting -> searching when the window expires with no candidates", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({ lastConnectedServer: SERVER_A })
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          // SERVER_A unreachable, no mDNS candidates.
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(new Map([[SERVER_A.controlUrl, false]])),
        })
        yield* TestClock.adjust("2 seconds")
        return yield* SubscriptionRef.get(controller.state)
      }),
    )

    expect(result.status).toBe("searching")
  })

  it("connects to the remembered server via direct probe without waiting for mDNS", async () => {
    // Slow mDNS (no candidates emitted) but the remembered URL responds
    // to /api/health. The direct-probe shortcut should connect within
    // the first reconcile, before the 1.5s window even expires.
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({ lastConnectedServer: SERVER_A })
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(new Map([[SERVER_A.controlUrl, true]])),
        })
        // No mDNS events, no clock advance — the direct probe should
        // resolve synchronously through the Effect.sync probe.
        yield* TestClock.adjust("10 millis")
        const state = yield* SubscriptionRef.get(controller.state)
        return { state, saved: config.saved() }
      }),
    )

    expect(result.state.status).toBe("connected")
    if (result.state.status === "connected") {
      expect(result.state.server).toEqual(SERVER_A)
    }
    expect(result.saved).toEqual([{ lastConnectedServer: SERVER_A }])
  })

  it("keeps the connected state when the window expires after a direct-probe success and mDNS is silent", async () => {
    // Regression: the direct-probe fiber set state to "connected", but
    // the controller's separate fiber kept `local.connected = undefined`
    // and, when its 1.5s window expired with no mDNS candidates, stomped
    // the SubscriptionRef back to "searching". `getConnection()` in the
    // launch bridge then refused press-A with "no connected upstream".
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({ lastConnectedServer: SERVER_A })
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(new Map([[SERVER_A.controlUrl, true]])),
        })
        // Direct probe fires immediately. Then we let the window expire
        // with no mDNS events. State must stay "connected" — the
        // controller must observe the SubscriptionRef before deciding to
        // downgrade.
        yield* TestClock.adjust("2 seconds")
        const state = yield* SubscriptionRef.get(controller.state)
        return state
      }),
    )

    expect(result.status).toBe("connected")
    if (result.status === "connected") {
      expect(result.server).toEqual(SERVER_A)
    }
  })

  it("connects to a later remembered server after the window expires", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({ lastConnectedServer: SERVER_A })
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(new Map([[SERVER_A.controlUrl, true]])),
        })
        yield* TestClock.adjust("3 seconds")
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_A) })
        yield* TestClock.adjust("1 second")
        return yield* SubscriptionRef.get(controller.state)
      }),
    )

    expect(result.status).toBe("connected")
  })

  it("ignores a probe failure and connects to the next successful candidate", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({})
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(
            new Map([
              [SERVER_A.controlUrl, false],
              [SERVER_B.controlUrl, true],
            ]),
          ),
        })
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_A) })
        yield* TestClock.adjust("2 seconds")
        const intermediate = yield* SubscriptionRef.get(controller.state)
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_B) })
        yield* TestClock.adjust("1 second")
        const final = yield* SubscriptionRef.get(controller.state)
        return { intermediate, final }
      }),
    )

    expect(result.intermediate.status).not.toBe("connected")
    expect(result.final.status).toBe("connected")
    if (result.final.status === "connected") {
      expect(result.final.server).toEqual(SERVER_B)
    }
  })

  it("returns to searching when the currently connected server disappears", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({})
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(new Map([[SERVER_A.controlUrl, true]])),
        })
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_A) })
        yield* TestClock.adjust("2 seconds")
        const connected = yield* SubscriptionRef.get(controller.state)
        yield* rig.emit({ kind: "disappear", controlUrl: SERVER_A.controlUrl })
        yield* TestClock.adjust("1 second")
        const after = yield* SubscriptionRef.get(controller.state)
        return { connected, after }
      }),
    )

    expect(result.connected.status).toBe("connected")
    expect(result.after.status).toBe("searching")
  })

  it("connects to a different server after the current one disappears", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({})
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(
            new Map([
              [SERVER_A.controlUrl, true],
              [SERVER_B.controlUrl, true],
            ]),
          ),
        })
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_A) })
        yield* TestClock.adjust("2 seconds")
        yield* rig.emit({ kind: "disappear", controlUrl: SERVER_A.controlUrl })
        yield* TestClock.adjust("100 millis")
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_B) })
        yield* TestClock.adjust("1 second")
        const state = yield* SubscriptionRef.get(controller.state)
        return { state, saved: config.saved() }
      }),
    )

    expect(result.state.status).toBe("connected")
    if (result.state.status === "connected") {
      expect(result.state.server).toEqual(SERVER_B)
    }
    expect(result.saved.map(s => s.lastConnectedServer?.hostId)).toEqual([
      "aka",
      "kara",
    ])
  })

  it("retries the remembered probe with backoff after an initial failure", async () => {
    // The remembered server is unreachable on the very first probe call
    // (e.g. kiosk started before Wi-Fi associated). The controller must
    // keep retrying the remembered URL with backoff and connect once the
    // network comes up, without waiting for mDNS.
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({ lastConnectedServer: SERVER_A })
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          // Fail twice then succeed.
          httpProbe: makeSequentialProbe(
            new Map([[SERVER_A.controlUrl, [false, false, true]]]),
          ),
          rememberedRetryInitialMs: 500,
          rememberedRetryFactor: 2,
          rememberedRetryMaxMs: 5_000,
        })

        // Initial direct probe fails.
        yield* TestClock.adjust("10 millis")
        const afterFirst = yield* SubscriptionRef.get(controller.state)

        // First backoff window: 500ms. Second probe also fails.
        yield* TestClock.adjust("600 millis")
        const afterSecond = yield* SubscriptionRef.get(controller.state)

        // Second backoff window: 1000ms. Third probe succeeds.
        yield* TestClock.adjust("1200 millis")
        const afterThird = yield* SubscriptionRef.get(controller.state)

        return { afterFirst, afterSecond, afterThird, saved: config.saved() }
      }),
    )

    expect(result.afterFirst.status).not.toBe("connected")
    expect(result.afterSecond.status).not.toBe("connected")
    expect(result.afterThird.status).toBe("connected")
    if (result.afterThird.status === "connected") {
      expect(result.afterThird.server).toEqual(SERVER_A)
    }
    expect(result.saved).toEqual([{ lastConnectedServer: SERVER_A }])
  })

  it("stops retrying the remembered probe once another candidate connects", async () => {
    // Remembered SERVER_A is unreachable for a long time. mDNS finds
    // SERVER_B and the controller connects to it. Later, SERVER_A's
    // direct probe would succeed — but because we are already connected,
    // the retry loop must have stopped and must not stomp the active
    // connection.
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({ lastConnectedServer: SERVER_A })
        // SERVER_A fails three times then would succeed; SERVER_B always OK.
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeSequentialProbe(
            new Map([
              [SERVER_A.controlUrl, [false, false, false, true]],
              [SERVER_B.controlUrl, [true]],
            ]),
          ),
          rememberedRetryInitialMs: 500,
          rememberedRetryFactor: 2,
          rememberedRetryMaxMs: 5_000,
        })

        // mDNS finds B after a moment; window expires and we connect to B.
        yield* TestClock.adjust("100 millis")
        yield* rig.emit({ kind: "appear", candidate: candidate(SERVER_B) })
        yield* TestClock.adjust("3 seconds")
        const afterConnect = yield* SubscriptionRef.get(controller.state)

        // Drain past the next retry windows; SERVER_A would now succeed.
        yield* TestClock.adjust("10 seconds")
        const final = yield* SubscriptionRef.get(controller.state)
        return { afterConnect, final, saved: config.saved() }
      }),
    )

    expect(result.afterConnect.status).toBe("connected")
    expect(result.final.status).toBe("connected")
    if (result.final.status === "connected") {
      expect(result.final.server).toEqual(SERVER_B)
    }
    expect(result.saved.map(s => s.lastConnectedServer?.hostId)).toEqual([
      "kara",
    ])
  })

  it("treats a load-config failure as an empty config", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: Effect.fail(new Error("disk gone")),
          saveConfig: () => Effect.void,
          httpProbe: makeProbe(new Map()),
        })
        return yield* SubscriptionRef.get(controller.state)
      }),
    )

    expect(result.status).toBe("searching")
  })

  // The "Ready" state shape includes helpAfter on pre-connected variants so U6
  // can compute help-text appearance from state alone.
  it("exposes helpAfter on pre-connected states", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const rig = yield* makeRig()
        const config = makeConfigRig({})
        const controller = yield* makeConnectionController({
          watcher: rig.stream,
          loadConfig: config.loadConfig,
          saveConfig: config.saveConfig,
          httpProbe: makeProbe(new Map()),
        })
        return yield* SubscriptionRef.get(controller.state)
      }),
    )

    expect(result.status).toBe("searching")
    if (result.status === "searching") {
      expect(result.helpAfter.getTime()).toBeGreaterThan(result.since.getTime())
    }
  })
})

// Make ConnectionState available for non-null assertions in this test file
// without leaking it into the public API.
export type _UsedConnectionState = ConnectionState
