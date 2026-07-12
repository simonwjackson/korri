import { describe, expect, it } from "bun:test"
import {
  createSunshineRemoteInputSourceAdapter,
  decodeSunshineInputSeatFrame,
} from "./sunshine-remote-input-source"

describe("Sunshine remote input source adapter", () => {
  it("binds the first source to P1, disconnects as reserved, and reconnects the same source", () => {
    const adapter = createSunshineRemoteInputSourceAdapter({
      launchId: "launch-1",
      seatCount: 2,
      maxEventsPerSecond: 10,
    })

    expect(
      adapter.accept({
        kind: "source-connected",
        launchId: "launch-1",
        controllerNumber: 0,
      }).status,
    ).toBe("accepted")
    expect(adapter.seats()[0]).toMatchObject({
      tag: "occupied-connected",
      slot: 1,
      sourceId: "sunshine:controller-0",
    })

    expect(
      adapter.accept({
        kind: "source-disconnected",
        launchId: "launch-1",
        controllerNumber: 0,
        reason: "stream-disconnected",
      }).status,
    ).toBe("accepted")
    expect(adapter.seats()[0]).toMatchObject({
      tag: "occupied-disconnected-reserved",
      slot: 1,
      reason: "stream-disconnected",
    })

    expect(
      adapter.accept({
        kind: "source-connected",
        launchId: "launch-1",
        controllerNumber: 0,
      }).status,
    ).toBe("accepted")
    expect(adapter.seats()[0]).toMatchObject({
      tag: "occupied-connected",
      slot: 1,
    })
  })

  it("binds a second source to the next available seat instead of stealing P1", () => {
    const adapter = createSunshineRemoteInputSourceAdapter({
      launchId: "launch-1",
      seatCount: 2,
      maxEventsPerSecond: 10,
    })

    adapter.accept({
      kind: "source-connected",
      launchId: "launch-1",
      controllerNumber: 0,
    })
    adapter.accept({
      kind: "source-connected",
      launchId: "launch-1",
      controllerNumber: 1,
    })

    expect(adapter.seats()).toEqual([
      {
        tag: "occupied-connected",
        slot: 1,
        launchId: "launch-1",
        sourceId: "sunshine:controller-0",
      },
      {
        tag: "occupied-connected",
        slot: 2,
        launchId: "launch-1",
        sourceId: "sunshine:controller-1",
      },
    ])
  })

  it("releases a live source binding on explicit leave", () => {
    const adapter = createSunshineRemoteInputSourceAdapter({
      launchId: "launch-1",
      seatCount: 1,
      maxEventsPerSecond: 10,
    })

    adapter.accept({
      kind: "source-connected",
      launchId: "launch-1",
      controllerNumber: 0,
    })
    expect(adapter.leaveSeat(1)).toBe(true)
    expect(adapter.seats()).toEqual([{ tag: "available", slot: 1 }])
    expect(
      adapter.accept({
        kind: "source-state",
        launchId: "launch-1",
        controllerNumber: 0,
        buttons: 1,
        leftTrigger: 0,
        rightTrigger: 0,
        leftStickX: 0,
        leftStickY: 0,
        rightStickX: 0,
        rightStickY: 0,
      }),
    ).toEqual({ status: "dropped", reason: "unknown-source" })

    expect(
      adapter.accept({
        kind: "source-connected",
        launchId: "launch-1",
        controllerNumber: 1,
      }),
    ).toEqual({ status: "accepted", slot: 1 })
  })

  it("drops stale-launch and non-gamepad frames", () => {
    const adapter = createSunshineRemoteInputSourceAdapter({
      launchId: "launch-1",
      seatCount: 1,
      maxEventsPerSecond: 10,
    })

    expect(
      adapter.accept({
        kind: "source-connected",
        launchId: "launch-2",
        controllerNumber: 0,
      }),
    ).toEqual({ status: "dropped", reason: "stale-launch" })
    expect(
      adapter.accept({
        kind: "source-keyboard",
        launchId: "launch-1",
      } as never),
    ).toEqual({ status: "dropped", reason: "non-gamepad-frame" })
    expect(adapter.seats()).toEqual([{ tag: "available", slot: 1 }])
  })

  it("rate-limits state frames without growing an unbounded queue", () => {
    let nowMs = 0
    const adapter = createSunshineRemoteInputSourceAdapter({
      launchId: "launch-1",
      seatCount: 1,
      maxEventsPerSecond: 2,
      nowMs: () => nowMs,
    })

    adapter.accept({
      kind: "source-connected",
      launchId: "launch-1",
      controllerNumber: 0,
    })

    expect(
      adapter.accept({
        kind: "source-state",
        launchId: "launch-1",
        controllerNumber: 0,
        buttons: 1,
        leftTrigger: 0,
        rightTrigger: 0,
        leftStickX: 0,
        leftStickY: 0,
        rightStickX: 0,
        rightStickY: 0,
      }).status,
    ).toBe("accepted")
    expect(
      adapter.accept({
        kind: "source-state",
        launchId: "launch-1",
        controllerNumber: 0,
        buttons: 2,
        leftTrigger: 0,
        rightTrigger: 0,
        leftStickX: 0,
        leftStickY: 0,
        rightStickX: 0,
        rightStickY: 0,
      }).status,
    ).toBe("accepted")
    expect(
      adapter.accept({
        kind: "source-state",
        launchId: "launch-1",
        controllerNumber: 0,
        buttons: 3,
        leftTrigger: 0,
        rightTrigger: 0,
        leftStickX: 0,
        leftStickY: 0,
        rightStickX: 0,
        rightStickY: 0,
      }),
    ).toEqual({ status: "dropped", reason: "rate-limited" })
    expect(adapter.forwardedEvents()).toHaveLength(2)

    nowMs = 1_000
    expect(
      adapter.accept({
        kind: "source-state",
        launchId: "launch-1",
        controllerNumber: 0,
        buttons: 4,
        leftTrigger: 0,
        rightTrigger: 0,
        leftStickX: 0,
        leftStickY: 0,
        rightStickX: 0,
        rightStickY: 0,
      }).status,
    ).toBe("accepted")
    expect(adapter.forwardedEvents()).toHaveLength(3)
  })

  it("bounds forwarded state history", () => {
    const adapter = createSunshineRemoteInputSourceAdapter({
      launchId: "launch-1",
      seatCount: 1,
      maxEventsPerSecond: 10,
      forwardedEventBufferSize: 2,
    })
    adapter.accept({
      kind: "source-connected",
      launchId: "launch-1",
      controllerNumber: 0,
    })

    for (const buttons of [1, 2, 3]) {
      adapter.accept({
        kind: "source-state",
        launchId: "launch-1",
        controllerNumber: 0,
        buttons,
        leftTrigger: 0,
        rightTrigger: 0,
        leftStickX: 0,
        leftStickY: 0,
        rightStickX: 0,
        rightStickY: 0,
      })
    }

    expect(adapter.forwardedEvents().map(event => event.frame.buttons)).toEqual(
      [2, 3],
    )
  })

  it("strictly decodes bounded gamepad frames", () => {
    expect(
      decodeSunshineInputSeatFrame({
        kind: "source-state",
        launchId: "launch-1",
        controllerNumber: 0,
        buttons: 1,
        leftTrigger: 0,
        rightTrigger: 255,
        leftStickX: -32768,
        leftStickY: 32767,
        rightStickX: 0,
        rightStickY: 0,
      }),
    ).toMatchObject({ kind: "source-state" })

    expect(() =>
      decodeSunshineInputSeatFrame({
        kind: "source-state",
        launchId: "launch-1",
        controllerNumber: 0,
        buttons: 1,
        leftTrigger: 300,
        rightTrigger: 0,
        leftStickX: 0,
        leftStickY: 0,
        rightStickX: 0,
        rightStickY: 0,
      }),
    ).toThrow()
  })
})
