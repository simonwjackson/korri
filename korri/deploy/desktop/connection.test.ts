import { describe, expect, it } from "bun:test"
import { Effect, Queue, type Scope, Stream, SubscriptionRef } from "effect"
import { TestClock } from "effect/testing"
import type { DesktopConfig } from "./desktop-config"
import {
  type ConnectionState,
  makeConnectionController,
  type ServerRecord,
} from "./connection"
import type { StreamHostCandidate, StreamHostEvent } from "../../../tools/cli/lan-stream-discovery"

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
    expect(result.saved.map(s => s.lastConnectedServer?.hostId)).toEqual(["aka", "kara"])
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
