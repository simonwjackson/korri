import { describe, expect, it } from "bun:test"
import {
  shiftStoreEntryFromClaim,
  shiftStoreSourceLabel,
  shiftStoreSourcesLabel,
} from "./shift-store-entry"

describe("shiftStoreSourceLabel", () => {
  it("maps known providers and title-cases unknown slugs", () => {
    expect(shiftStoreSourceLabel("@korri:itchio")).toBe("itch.io")
    expect(shiftStoreSourceLabel("@korri:community-catalog")).toBe("Community")
    expect(shiftStoreSourceLabel("@korri:cool-mirror")).toBe("Cool Mirror")
  })
})

describe("shiftStoreSourcesLabel", () => {
  it("names a single source and counts a grouped release", () => {
    expect(shiftStoreSourcesLabel([])).toBe("")
    expect(shiftStoreSourcesLabel(["itch.io"])).toBe("itch.io")
    expect(shiftStoreSourcesLabel(["itch.io", "Community"])).toBe("2 sources")
    expect(shiftStoreSourcesLabel(["a", "b", "c"])).toBe("3 sources")
  })
})

describe("shiftStoreEntryFromClaim", () => {
  it("projects a claim into a single-source entry pending acquisition", () => {
    const entry = shiftStoreEntryFromClaim({
      _tag: "ProviderClaim",
      providerId: "@korri:itchio",
      id: "abc",
      title: "Some Game",
      url: "https://example.com/g",
      platform: "linux",
    })
    expect(entry.id).toBe("abc")
    expect(entry.sources).toEqual(["itch.io"])
    expect(entry.platform).toBe("linux")
    expect(entry.status).toBe("available")
  })
})
