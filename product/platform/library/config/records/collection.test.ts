import { describe, expect, it } from "bun:test"

import { decodeCollectionPayload } from "./collection"

const wrapperProvider = "@example:wrapper"
const retiredWrapperKey = ["game", "scope"].join("")

type WrapperPolicy = { readonly enable?: boolean }

const wrapperPolicy = (value: unknown): WrapperPolicy | undefined =>
  value as WrapperPolicy | undefined

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
      launch: { with: { [wrapperProvider]: { enable: true } } },
      presets: {
        feature: { launch: { with: { [wrapperProvider]: { enable: true } } } },
      },
    })
    expect(
      wrapperPolicy(collection.launch?.with?.[wrapperProvider])?.enable,
    ).toBe(true)
    expect(
      wrapperPolicy(
        collection.presets?.feature?.launch?.with?.[wrapperProvider],
      )?.enable,
    ).toBe(true)
  })

  it("rejects the retired top-level wrapper field", () => {
    expect(() =>
      decodeCollectionPayload({ [retiredWrapperKey]: { enable: true } }),
    ).toThrow()
  })

  it("rejects identity-field bypass", () => {
    expect(() => decodeCollectionPayload({ system: "snes" })).toThrow()
  })

  it("rejects an unknown key (typo)", () => {
    expect(() => decodeCollectionPayload({ titel: "Bad" })).toThrow()
  })
})
