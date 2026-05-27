import { describe, expect, it } from "bun:test"
import { composeEntryKey, parseEntryKey } from "./entry-key"

describe("composeEntryKey", () => {
  it("composes `${hostId}::${id}` when source is present", () => {
    expect(
      composeEntryKey({
        id: "pico-8/celeste",
        source: {
          hostId: "sobo",
          controlUrl: "http://192.168.1.239:3001",
          isLocal: true,
        },
      }),
    ).toBe("sobo::pico-8/celeste")
  })

  it("distinguishes same id from different sources", () => {
    const aka = composeEntryKey({
      id: "pico-8/celeste",
      source: { hostId: "aka", controlUrl: "x", isLocal: false },
    })
    const sobo = composeEntryKey({
      id: "pico-8/celeste",
      source: { hostId: "sobo", controlUrl: "y", isLocal: true },
    })
    expect(aka).not.toBe(sobo)
  })

  it("falls back to bare id when source is absent", () => {
    expect(composeEntryKey({ id: "snes/zelda" })).toBe("snes/zelda")
  })

  it("falls back to bare id when source.hostId is empty", () => {
    expect(
      composeEntryKey({
        id: "snes/zelda",
        source: { hostId: "", controlUrl: "x", isLocal: true },
      }),
    ).toBe("snes/zelda")
  })

  it("handles ids that contain the separator without ambiguity (parse round-trip)", () => {
    const key = composeEntryKey({
      id: "snes::weird::id",
      source: { hostId: "aka", controlUrl: "x", isLocal: false },
    })
    expect(key).toBe("aka::snes::weird::id")
    expect(parseEntryKey(key)).toEqual({
      hostId: "aka",
      id: "snes::weird::id",
    })
  })
})

describe("parseEntryKey", () => {
  it("splits on the first `::` separator", () => {
    expect(parseEntryKey("sobo::pico-8/celeste")).toEqual({
      hostId: "sobo",
      id: "pico-8/celeste",
    })
  })

  it("returns null source for bare-id keys (no separator)", () => {
    expect(parseEntryKey("snes/zelda")).toEqual({
      hostId: undefined,
      id: "snes/zelda",
    })
  })
})
