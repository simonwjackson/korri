import { describe, expect, it } from "bun:test"
import { connectInputSeat, type InputSeatState } from "./seat-state"
import { createMemoryRemoteInputSource } from "./remote-input-source"

describe("remote input source", () => {
  it("reports connected, disconnected-reserved, reconnected, and explicit leave transitions", () => {
    const source = createMemoryRemoteInputSource({ launchId: "launch-1" })
    let state: InputSeatState = { tag: "available", slot: 1 }

    state = source.connected(state, "source-1")
    expect(state).toMatchObject({
      tag: "occupied-connected",
      sourceId: "source-1",
    })

    state = source.disconnected(state, "stream closed")
    expect(state).toMatchObject({ tag: "occupied-disconnected-reserved" })

    state = source.reconnected(state, "source-1")
    expect(state).toMatchObject({
      tag: "occupied-connected",
      sourceId: "source-1",
    })

    state = source.left(state)
    expect(state).toEqual({ tag: "available", slot: 1 })
    expect(source.events()).toEqual([
      "connected:source-1",
      "disconnected:stream closed",
      "reconnected:source-1",
      "left",
    ])
  })

  it("does not steal an occupied seat", () => {
    const source = createMemoryRemoteInputSource({ launchId: "launch-1" })
    const occupied = connectInputSeat(
      { tag: "available", slot: 1 },
      { launchId: "launch-1", sourceId: "source-1" },
    )

    expect(() => source.connected(occupied, "source-2")).toThrow(
      /not available/,
    )
  })
})
