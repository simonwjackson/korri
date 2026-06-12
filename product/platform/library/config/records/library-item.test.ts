import { describe, expect, it } from "bun:test"

import { decodeCollectionPayload } from "./collection"
import {
  decodeLibraryItemPayload,
  decodeLibraryItemRecord,
} from "./library-item"
import { decodeUserPayload } from "./user"

describe("LibraryItemPayload playable/release identity", () => {
  it("decodes a package with local contains ids and path-style version references", () => {
    const item = decodeLibraryItemRecord({
      id: "super-mario-advance-2",
      title: "Super Mario Advance 2",
      contains: {
        "super-mario-world": {
          title: "Super Mario World",
          "version-of": "super-mario-world",
          relation: "gba-port",
        },
      },
      releases: [
        {
          id: "gba",
          system: "gba",
          target: "gba/Super Mario Advance 2.gba",
        },
      ],
    })

    expect(item.contains?.["super-mario-world"]?.["version-of"]).toBe(
      "super-mario-world",
    )
  })

  it("rejects contained ids that are already global path ids", () => {
    expect(() =>
      decodeLibraryItemPayload({
        contains: {
          "super-mario-advance-2/super-mario-world": {
            title: "Super Mario World",
          },
        },
        releases: [{ id: "gba", system: "gba", target: "gba/cart.gba" }],
      }),
    ).toThrow()
  })

  it("rejects singular collection and malformed playable references", () => {
    expect(() =>
      decodeLibraryItemPayload({
        collection: "handheld",
        releases: [{ id: "windows", system: "windows", target: "steam://x" }],
      }),
    ).toThrow()

    expect(() =>
      decodeLibraryItemPayload({
        "version-of": "super-mario-advance-2/super-mario-world/extra",
        releases: [{ id: "windows", system: "windows", target: "steam://x" }],
      }),
    ).toThrow()
  })

  it("rejects duplicate release ids", () => {
    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          { id: "windows", system: "windows", target: "steam://one" },
          { id: "windows", system: "windows", target: "steam://two" },
        ],
      }),
    ).toThrow()
  })

  it("rejects malformed release ids", () => {
    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "windows/steam",
            system: "windows",
            target: "steam://rungameid/360740",
          },
        ],
      }),
    ).toThrow()
  })

  it("decodes release app choices", () => {
    const item = decodeLibraryItemPayload({
      releases: [
        {
          id: "gba",
          system: "gba",
          target: "gba/cart.gba",
          apps: [{ id: "retroarch", runtime: "mgba" }],
        },
      ],
    })

    expect(item.releases[0]?.apps).toEqual([
      { id: "retroarch", runtime: "mgba" },
    ])
  })

  it("rejects empty and duplicate release app choices", () => {
    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          { id: "gba", system: "gba", target: "gba/cart.gba", apps: [] },
        ],
      }),
    ).toThrow(/apps.*empty|at least one app choice/i)

    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "gba",
            system: "gba",
            target: "gba/cart.gba",
            apps: [{ id: "retroarch" }, { id: "retroarch" }],
          },
        ],
      }),
    ).toThrow(/unique/)
  })
})

describe("shared playable-id references", () => {
  it("validates user favorites and hidden entries as playable ids", () => {
    const user = decodeUserPayload({
      favorites: ["downwell", "super-mario-advance-2/super-mario-world"],
      hidden: ["super-mario-advance-2/mario-bros"],
    })
    expect(user.favorites).toEqual([
      "downwell",
      "super-mario-advance-2/super-mario-world",
    ])
    expect(() => decodeUserPayload({ favorites: ["bad/id/extra"] })).toThrow()
  })

  it("validates explicit collection items as playable ids", () => {
    const collection = decodeCollectionPayload({
      title: "Weekend games",
      items: ["downwell", "super-mario-advance-2/super-mario-world"],
    })
    expect(collection.items).toEqual([
      "downwell",
      "super-mario-advance-2/super-mario-world",
    ])
    expect(() => decodeCollectionPayload({ items: ["bad id"] })).toThrow()
  })
})
