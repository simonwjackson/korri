import { describe, expect, it } from "bun:test"
import {
  shiftMonogram,
  shiftMonogramHue,
  shiftMonogramInitials,
} from "./shift-monogram"

describe("shiftMonogramInitials", () => {
  it("takes the first letters of the first two words", () => {
    expect(shiftMonogramInitials("Hollow Knight")).toBe("HK")
  })

  it("draws two letters from a single-word title", () => {
    expect(shiftMonogramInitials("Celeste")).toBe("CE")
  })

  it("drops articles and connectors when a word remains", () => {
    expect(shiftMonogramInitials("The Legend of Zelda")).toBe("LZ")
  })

  it("keeps a lone article rather than emptying the glyph", () => {
    expect(shiftMonogramInitials("The")).toBe("TH")
  })

  it("handles leading numbers and punctuation", () => {
    expect(shiftMonogramInitials("1080° Snowboarding")).toBe("1S")
  })

  it("falls back to a placeholder for an empty title", () => {
    expect(shiftMonogramInitials("")).toBe("?")
    expect(shiftMonogramInitials("   ")).toBe("?")
  })
})

describe("shiftMonogramHue", () => {
  it("is deterministic for the same title", () => {
    expect(shiftMonogramHue("Hollow Knight")).toBe(
      shiftMonogramHue("Hollow Knight"),
    )
  })

  it("stays within the hue wheel", () => {
    for (const title of ["Celeste", "Hades", "Tunic", "", "A"]) {
      const hue = shiftMonogramHue(title)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
  })

  it("spreads distinct titles across different hues", () => {
    expect(shiftMonogramHue("Celeste")).not.toBe(shiftMonogramHue("Hades"))
  })
})

describe("shiftMonogram", () => {
  it("bundles initials and hue", () => {
    expect(shiftMonogram("Hollow Knight")).toEqual({
      initials: "HK",
      hue: shiftMonogramHue("Hollow Knight"),
    })
  })
})
