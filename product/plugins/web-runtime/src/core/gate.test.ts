import { describe, expect, it } from "bun:test"
import { nextGateAction } from "./gate"

describe("nextGateAction", () => {
  it("waits until a canvas exists regardless of strategy", () => {
    expect(
      nextGateAction("trusted-click", {
        hasCanvas: false,
        userActivationHasBeen: false,
      }),
    ).toEqual({ kind: "wait" })
  })

  it("is done immediately for a self-starting (none) engine", () => {
    expect(
      nextGateAction("none", { hasCanvas: true, userActivationHasBeen: null }),
    ).toEqual({ kind: "done" })
  })

  it("dispatches synthetic events for a synthetic-gated engine", () => {
    expect(
      nextGateAction("synthetic", {
        hasCanvas: true,
        userActivationHasBeen: null,
      }),
    ).toEqual({ kind: "synthetic-events" })
  })

  it("requires a trusted gesture when user activation has not happened", () => {
    // GameMaker focus gate: synthetic events do NOT grant activation
    expect(
      nextGateAction("trusted-click", {
        hasCanvas: true,
        userActivationHasBeen: false,
      }),
    ).toEqual({ kind: "trusted-gesture" })
  })

  it("is done once user activation has occurred", () => {
    expect(
      nextGateAction("trusted-click", {
        hasCanvas: true,
        userActivationHasBeen: true,
      }),
    ).toEqual({ kind: "done" })
  })
})
