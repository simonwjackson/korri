import { describe, expect, it } from "bun:test"
import {
  connectInputSeat,
  disconnectInputSeat,
  leaveInputSeat,
  reconnectInputSeat,
  type InputSeatState,
} from "./seat-state"

const available: InputSeatState = { tag: "available", slot: 1 }

describe("input-seat state", () => {
  it("disconnects without releasing the emulator-visible seat", () => {
    const connected = connectInputSeat(available, {
      launchId: "launch-1",
      sourceId: "source-1",
    })
    const disconnected = disconnectInputSeat(connected, "stream closed")

    expect(disconnected).toEqual({
      tag: "occupied-disconnected-reserved",
      slot: 1,
      launchId: "launch-1",
      sourceId: "source-1",
      reason: "stream closed",
    })
  })

  it("reconnects only the same launch-scoped source identity", () => {
    const reserved = disconnectInputSeat(
      connectInputSeat(available, {
        launchId: "launch-1",
        sourceId: "source-1",
      }),
      "stream closed",
    )

    expect(
      reconnectInputSeat(reserved, {
        launchId: "launch-1",
        sourceId: "source-1",
      }),
    ).toMatchObject({
      tag: "occupied-connected",
      sourceId: "source-1",
    })
    expect(() =>
      reconnectInputSeat(reserved, {
        launchId: "launch-1",
        sourceId: "source-2",
      }),
    ).toThrow(/reserved for a different source/)
  })

  it("explicit leave releases an occupied or reserved seat back to available", () => {
    const connected = connectInputSeat(available, {
      launchId: "launch-1",
      sourceId: "source-1",
    })
    expect(leaveInputSeat(connected)).toEqual({ tag: "available", slot: 1 })
    expect(
      leaveInputSeat(disconnectInputSeat(connected, "stream closed")),
    ).toEqual({
      tag: "available",
      slot: 1,
    })
  })

  it("does not let a second source steal an occupied seat", () => {
    const connected = connectInputSeat(available, {
      launchId: "launch-1",
      sourceId: "source-1",
    })

    expect(() =>
      connectInputSeat(connected, {
        launchId: "launch-1",
        sourceId: "source-2",
      }),
    ).toThrow(/not available/)
  })
})
