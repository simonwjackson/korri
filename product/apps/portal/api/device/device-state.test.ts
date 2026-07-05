import { describe, expect, it } from "bun:test"
import { Effect, Stream } from "effect"
import { DeviceState, makeDeviceStateLayer } from "./device-state"

async function waitUntil(predicate: () => boolean) {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error("condition was not met")
}

function battery(percent: number) {
  return {
    percent,
    status: "Discharging",
    supplies: [
      {
        name: "BAT0",
        type: "Battery",
        status: "Discharging",
        capacity: percent,
        online: null,
        voltageNow: null,
        currentNow: null,
        powerNow: null,
        modelName: null,
      },
    ],
  }
}

function connectedWifi(strengthPercent = 82) {
  return {
    connected: true,
    kind: "wifi" as const,
    strengthPercent,
  }
}

describe("DeviceState service", () => {
  it("seeds current state from the startup device probes", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* DeviceState
          return yield* service.current()
        }).pipe(
          Effect.provide(
            makeDeviceStateLayer({
              startBackground: false,
              now: () => new Date("2026-07-01T00:00:00.000Z"),
              readBattery: async () => battery(82),
              readNetwork: async () => connectedWifi(76),
            }),
          ),
        ),
      ),
    )

    expect(result.battery).toMatchObject({ _tag: "Ready", percent: 82 })
    expect(result.network).toMatchObject({
      _tag: "Connected",
      kind: "wifi",
      strengthPercent: 76,
    })
  })

  it("delivers current state first on the changes stream", async () => {
    const events = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* DeviceState
          return yield* service.changes.pipe(Stream.take(1), Stream.runCollect)
        }).pipe(
          Effect.provide(
            makeDeviceStateLayer({
              startBackground: false,
              readBattery: async () => battery(64),
              readNetwork: async () => connectedWifi(),
            }),
          ),
        ),
      ),
    )

    const first = Array.from(events)[0]
    expect(first?.battery).toMatchObject({
      _tag: "Ready",
      percent: 64,
    })
    expect(first?.network).toMatchObject({ _tag: "Connected" })
  })

  it("routes refresh through the same state update pipeline", async () => {
    let percent = 50
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* DeviceState
          percent = 51
          const refresh = yield* service.refresh()
          const current = yield* service.current()
          return { refresh, current }
        }).pipe(
          Effect.provide(
            makeDeviceStateLayer({
              startBackground: false,
              readBattery: async () => battery(percent),
              readNetwork: async () => connectedWifi(),
            }),
          ),
        ),
      ),
    )

    expect(result.refresh).toMatchObject({
      accepted: true,
      facts: ["battery", "network"],
    })
    expect(result.current.battery).toMatchObject({ _tag: "Ready", percent: 51 })
  })

  it("serializes overlapping refresh requests", async () => {
    const resolvers: Array<(value: ReturnType<typeof battery>) => void> = []
    let readCount = 0

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* DeviceState
          return yield* Effect.promise(async () => {
            const first = Effect.runPromise(service.refresh())
            const second = Effect.runPromise(service.refresh())
            await waitUntil(() => resolvers.length === 1)
            const readsWhileFirstPending = readCount
            resolvers[0]?.(battery(60))
            await waitUntil(() => resolvers.length === 2)
            const readsAfterFirstResolves = readCount
            resolvers[1]?.(battery(61))
            await Promise.all([first, second])
            const current = await Effect.runPromise(service.current())
            return { readsWhileFirstPending, readsAfterFirstResolves, current }
          })
        }).pipe(
          Effect.provide(
            makeDeviceStateLayer({
              startBackground: false,
              readNetwork: async () => connectedWifi(),
              readBattery: async () => {
                readCount += 1
                if (readCount === 1) return battery(50)
                return new Promise(resolve => resolvers.push(resolve))
              },
            }),
          ),
        ),
      ),
    )

    expect(result.readsWhileFirstPending).toBe(2)
    expect(result.readsAfterFirstResolves).toBe(3)
    expect(result.current.battery).toMatchObject({ _tag: "Ready", percent: 61 })
  })

  it("preserves last-known battery as stale after transient read failure", async () => {
    let fail = false
    const state = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* DeviceState
          fail = true
          yield* service.refresh()
          return yield* service.current()
        }).pipe(
          Effect.provide(
            makeDeviceStateLayer({
              startBackground: false,
              readNetwork: async () => connectedWifi(),
              readBattery: async () => {
                if (fail) throw new Error("power supply busy")
                return battery(77)
              },
            }),
          ),
        ),
      ),
    )

    expect(state.battery).toMatchObject({
      _tag: "Stale",
      message: "power supply busy",
      lastKnown: { percent: 77 },
    })
  })

  it("preserves last-known network as stale after transient read failure", async () => {
    let fail = false
    const state = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* DeviceState
          fail = true
          yield* service.refresh()
          return yield* service.current()
        }).pipe(
          Effect.provide(
            makeDeviceStateLayer({
              startBackground: false,
              readBattery: async () => battery(77),
              readNetwork: async () => {
                if (fail) throw new Error("network busy")
                return connectedWifi(68)
              },
            }),
          ),
        ),
      ),
    )

    expect(state.network).toMatchObject({
      _tag: "Stale",
      message: "network busy",
      lastKnown: { _tag: "Connected", strengthPercent: 68 },
    })
  })
})
