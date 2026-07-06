import { describe, expect, it } from "bun:test"
import { INPUT_SEAT_PROVIDER_ID } from "@platform/input-seat/policy"
import { createMemorySeatRuntime } from "@platform/input-seat/seat-runtime-port"
import { createSessiondInputSeatPreSpawnGate } from "./sessiond-input-seat"

describe("sessiond input-seat gate", () => {
  it("allocates the resolved P1-P4 seat pool before spawn and releases on stop", async () => {
    const runtime = createMemorySeatRuntime()
    const gate = createSessiondInputSeatPreSpawnGate({
      runtime,
      timeoutMs: 100,
    })

    const handle = await gate.start({
      launchId: "launch-1",
      spec: { command: "/bin/game", args: [] },
      signal: new AbortController().signal,
      launchCompanions: {
        [INPUT_SEAT_PROVIDER_ID]: { runtimeSupportsExtraSeats: true },
      },
    })

    expect(runtime.createdSlots()).toEqual([1, 2, 3, 4])
    await handle?.stop()
    expect(runtime.releasedSlots()).toEqual([1, 2, 3, 4])
  })

  it("honors opt-down policy", async () => {
    const runtime = createMemorySeatRuntime()
    const gate = createSessiondInputSeatPreSpawnGate({
      runtime,
      timeoutMs: 100,
    })

    await gate.start({
      launchId: "launch-1",
      spec: { command: "/bin/game", args: [] },
      signal: new AbortController().signal,
      launchCompanions: {
        [INPUT_SEAT_PROVIDER_ID]: { playerCount: 2 },
      },
    })

    expect(runtime.createdSlots()).toEqual([1, 2])
  })

  it("skips allocation when policy is absent or disabled", async () => {
    const runtime = createMemorySeatRuntime()
    const gate = createSessiondInputSeatPreSpawnGate({
      runtime,
      timeoutMs: 100,
    })

    expect(
      await gate.start({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
      }),
    ).toBeUndefined()
    expect(
      await gate.start({
        launchId: "launch-2",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
        launchCompanions: {
          [INPUT_SEAT_PROVIDER_ID]: { playerCount: 0 },
        },
      }),
    ).toBeUndefined()
    expect(runtime.createdSlots()).toEqual([])
  })

  it("maps ambiguous runtime allocation to input-ambiguous", async () => {
    const runtime = createMemorySeatRuntime({ duplicateName: "Korri Seat P1" })
    const gate = createSessiondInputSeatPreSpawnGate({
      runtime,
      timeoutMs: 100,
    })

    await expect(
      gate.start({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
        launchCompanions: {
          [INPUT_SEAT_PROVIDER_ID]: { playerCount: 1 },
        },
      }),
    ).rejects.toMatchObject({ failureKind: "input-ambiguous" })
  })

  it("maps unavailable runtime allocation to input-unavailable", async () => {
    const runtime = createMemorySeatRuntime({ failAtSlot: 2 })
    const gate = createSessiondInputSeatPreSpawnGate({
      runtime,
      timeoutMs: 100,
    })

    await expect(
      gate.start({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
        launchCompanions: {
          [INPUT_SEAT_PROVIDER_ID]: { playerCount: 2 },
        },
      }),
    ).rejects.toMatchObject({ failureKind: "input-unavailable" })
    expect(runtime.releasedSlots()).toEqual([1])
  })
})
