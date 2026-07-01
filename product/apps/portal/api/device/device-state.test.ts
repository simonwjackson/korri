import { describe, expect, it } from "bun:test"
import { Effect, Layer, Stream } from "effect"
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

describe("DeviceState service", () => {
  it("seeds current state from the startup battery probe", async () => {
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
            }),
          ),
        ),
      ),
    )

    expect(result.battery).toMatchObject({ _tag: "Ready", percent: 82 })
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
            }),
          ),
        ),
      ),
    )

    expect(Array.from(events)[0]?.battery).toMatchObject({
      _tag: "Ready",
      percent: 64,
    })
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
            }),
          ),
        ),
      ),
    )

    expect(result.refresh).toMatchObject({ accepted: true, fact: "battery" })
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
})
