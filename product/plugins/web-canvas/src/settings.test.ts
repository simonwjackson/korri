import { describe, expect, it } from "bun:test"
import { decodeCanvasSettings } from "./settings"

describe("canvas settings", () => {
  it("decodes empty (all optional)", () => {
    expect(decodeCanvasSettings({})).toEqual({})
  })
  it("decodes the full preference set", () => {
    expect(
      decodeCanvasSettings({
        background: "#101010",
        resolution: { width: 1280, height: 720 },
        scaling: "smooth",
        fit: "cover",
        rotate: 90,
        gate: "none",
        shim: ["/nix/store/x/level.js"],
      }),
    ).toMatchObject({
      scaling: "smooth",
      fit: "cover",
      rotate: 90,
      gate: "none",
    })
  })
  it("rejects unknown keys and bad enums", () => {
    expect(() => decodeCanvasSettings({ foo: 1 })).toThrow()
    expect(() => decodeCanvasSettings({ fit: "zoom" })).toThrow()
    expect(() => decodeCanvasSettings({ rotate: 45 })).toThrow()
  })
})
