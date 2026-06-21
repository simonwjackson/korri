import { describe, expect, it } from "bun:test"
import { decodeWebpageSettings } from "./settings"

describe("webpage settings", () => {
  it("decodes empty/undefined", () => {
    expect(decodeWebpageSettings({})).toEqual({})
    expect(decodeWebpageSettings(undefined)).toEqual({})
  })
  it("decodes audio/saves/userAgent", () => {
    expect(
      decodeWebpageSettings({
        audio: "muted",
        saves: "persist",
        userAgent: "X",
      }),
    ).toMatchObject({ audio: "muted", saves: "persist", userAgent: "X" })
  })
  it("rejects unknown keys and bad enums", () => {
    expect(() => decodeWebpageSettings({ foo: 1 })).toThrow()
    expect(() => decodeWebpageSettings({ audio: "loud" })).toThrow()
    expect(() => decodeWebpageSettings({ scaling: "pixel" })).toThrow()
  })
})
