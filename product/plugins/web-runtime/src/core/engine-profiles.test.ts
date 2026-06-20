import { describe, expect, it } from "bun:test"
import { engineProfile } from "./engine-profiles"

describe("engineProfile", () => {
  it("normalizes GameMaker to fixed-canvas + trusted-click + overflow-kill", () => {
    expect(engineProfile("gamemaker")).toMatchObject({
      fixedCanvas: true,
      gate: "trusted-click",
      killOverflow: true,
      nativeResolution: "detect",
      shim: "gamemaker",
    })
  })

  it("normalizes Construct to responsive + synthetic, no gap", () => {
    expect(engineProfile("construct")).toMatchObject({
      fixedCanvas: false,
      gate: "synthetic",
      shim: "construct",
    })
  })

  it("treats Construct 2 like Construct", () => {
    expect(engineProfile("construct2").shim).toBe("construct")
  })

  it("gives responsive engines a generic, self-starting profile", () => {
    expect(engineProfile("unity")).toMatchObject({
      fixedCanvas: false,
      gate: "none",
      shim: "generic",
    })
  })

  it("falls back to a safe generic profile for unknown engines", () => {
    expect(engineProfile("generic")).toMatchObject({
      gate: "none",
      shim: "generic",
    })
  })
})
