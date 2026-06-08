import { describe, expect, it } from "bun:test"

import { decodeCollectionPayload } from "./collection"

describe("CollectionPayload", () => {
  it("decodes a minimal collection (every field optional)", () => {
    const collection = decodeCollectionPayload({})
    expect(collection).toEqual({})
  })

  it("decodes title + description", () => {
    const collection = decodeCollectionPayload({
      title: "Classics — 1990s",
      description: "Hand-picked classics from the 90s.",
    })
    expect(collection.title).toBe("Classics — 1990s")
  })

  it("decodes optional layer-bearing fields (presets reserved for future)", () => {
    const collection = decodeCollectionPayload({
      title: "Classics",
      presets: { feature: { gamescope: { enable: true } } },
    })
    expect(collection.presets?.feature?.gamescope?.enable).toBe(true)
  })

  it("rejects identity-field bypass", () => {
    expect(() => decodeCollectionPayload({ system: "snes" })).toThrow()
  })

  it("rejects an unknown key (typo)", () => {
    expect(() => decodeCollectionPayload({ titel: "Bad" })).toThrow()
  })
})
