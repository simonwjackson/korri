import { describe, expect, it } from "bun:test"
import { decodeBox64Policy, normalizeBox64Policy } from "./policy"

describe("Box64 policy", () => {
  it("normalizes the reusable runtime defaults without forcing X11", () => {
    expect(normalizeBox64Policy({})).toEqual({
      enable: true,
      command: "box64",
      preferEmulated: false,
    })
  })

  it("rejects malformed policy values", () => {
    expect(() => decodeBox64Policy({ maxCpu: 0 })).toThrow()
    expect(() => decodeBox64Policy({ sdlVideoDriver: "" })).toThrow()
  })
})
