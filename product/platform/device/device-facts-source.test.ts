import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  DeviceFactsSource,
  makeStaticDeviceFactsSourceLayer,
} from "./device-facts-source"
import { unknownDeviceState } from "./device-facts"

describe("DeviceFactsSource", () => {
  it("static layer delivers current state first to subscribers", async () => {
    const state = unknownDeviceState("2026-07-01T00:00:00.000Z")
    const seen: unknown[] = []

    await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* DeviceFactsSource
        const unsubscribe = yield* source.subscribe(next => seen.push(next))
        unsubscribe()
      }).pipe(Effect.provide(makeStaticDeviceFactsSourceLayer(state))),
    )

    expect(seen).toEqual([state])
  })
})
