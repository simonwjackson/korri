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
          target: {
            kind: "file",
            storage: "roms",
            path: "gba/Super Mario Advance 2.gba",
          },
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
        releases: [
          {
            id: "gba",
            system: "gba",
            target: { kind: "file", storage: "roms", path: "gba/cart.gba" },
          },
        ],
      }),
    ).toThrow()
  })

  it("rejects singular collection and malformed playable references", () => {
    expect(() =>
      decodeLibraryItemPayload({
        collection: "handheld",
        releases: [
          {
            id: "windows",
            system: "windows",
            target: { kind: "url", value: "steam://x" },
          },
        ],
      }),
    ).toThrow()

    expect(() =>
      decodeLibraryItemPayload({
        "version-of": "super-mario-advance-2/super-mario-world/extra",
        releases: [
          {
            id: "windows",
            system: "windows",
            target: { kind: "url", value: "steam://x" },
          },
        ],
      }),
    ).toThrow()
  })

  it("rejects duplicate release ids", () => {
    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "windows",
            system: "windows",
            target: { kind: "url", value: "steam://one" },
          },
          {
            id: "windows",
            system: "windows",
            target: { kind: "url", value: "steam://two" },
          },
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
            target: { kind: "url", value: "steam://rungameid/360740" },
          },
        ],
      }),
    ).toThrow()
  })

  it("rejects legacy release app/app-choice and runtime fields", () => {
    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "gba",
            system: "gba",
            target: { kind: "file", storage: "roms", path: "gba/cart.gba" },
            app: "retroarch",
          },
        ],
      }),
    ).toThrow(/apps|release\.app/i)

    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "gba",
            system: "gba",
            target: { kind: "file", storage: "roms", path: "gba/cart.gba" },
            runtime: "mgba",
          },
        ],
      }),
    ).toThrow(/apps|release\.runtime/i)
  })

  it("decodes path-only file releases without identity metadata", () => {
    const item = decodeLibraryItemPayload({
      releases: [
        {
          id: "gba",
          system: "gba",
          target: { kind: "file", storage: "roms", path: "gba/cart.gba" },
        },
      ],
    })

    expect(item.releases[0]?.target).toEqual({
      kind: "file",
      storage: "roms",
      path: "gba/cart.gba",
    })
    expect(item.releases[0]?.identity).toBeUndefined()
  })

  it("decodes discovery metadata on file targets", () => {
    const item = decodeLibraryItemPayload({
      releases: [
        {
          id: "gba",
          system: "gba",
          target: {
            kind: "file",
            storage: "roms",
            path: "gba/cart.gba",
            discovery: { "first-seen-at": "2026-06-29T12:34:56.000Z" },
          },
        },
      ],
    })

    expect(item.releases[0]?.target).toEqual({
      kind: "file",
      storage: "roms",
      path: "gba/cart.gba",
      discovery: { "first-seen-at": "2026-06-29T12:34:56.000Z" },
    })
  })

  it("rejects empty discovery metadata on file targets", () => {
    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "gba",
            system: "gba",
            target: {
              kind: "file",
              storage: "roms",
              path: "gba/cart.gba",
              discovery: { "first-seen-at": "" },
            },
          },
        ],
      }),
    ).toThrow(/non-empty|first-seen-at/i)
  })

  it("rejects discovery metadata on non-file targets", () => {
    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "steam",
            system: "windows",
            target: {
              kind: "provider-ref",
              provider: "@korri:steam",
              ref: "1029210",
              discovery: { "first-seen-at": "2026-06-29T12:34:56.000Z" },
            },
          },
        ],
      }),
    ).toThrow(/discovery|Unexpected key/i)
  })

  it("decodes declared hash identity for file releases", () => {
    const artifactId =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const item = decodeLibraryItemPayload({
      releases: [
        {
          id: "gba",
          system: "gba",
          target: { kind: "file", storage: "roms", path: "gba/cart.gba" },
          identity: { kind: "hash", value: artifactId },
        },
      ],
    })

    expect(item.releases[0]?.identity).toEqual({
      kind: "hash",
      value: artifactId,
    })
  })

  it("rejects malformed declared hash identity", () => {
    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "gba",
            system: "gba",
            target: { kind: "file", storage: "roms", path: "gba/cart.gba" },
            identity: { kind: "hash", value: "not-a-sha256-artifact-id" },
          },
        ],
      }),
    ).toThrow(/sha256/i)
  })

  it("rejects declared hash identity on non-file targets", () => {
    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "steam",
            system: "windows",
            target: { kind: "url", value: "steam://rungameid/360740" },
            identity: {
              kind: "hash",
              value:
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
          },
        ],
      }),
    ).toThrow(/file targets/i)
  })

  it("decodes release launch overlays", () => {
    const item = decodeLibraryItemPayload({
      releases: [
        {
          id: "gba",
          system: "gba",
          target: { kind: "file", storage: "roms", path: "gba/cart.gba" },
          launch: { use: "retroarch", runtime: "mgba" },
        },
      ],
    })

    expect(item.releases[0]?.launch).toEqual({
      use: "retroarch",
      runtime: "mgba",
    })
  })

  it("rejects release app choices", () => {
    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "gba",
            system: "gba",
            target: { kind: "file", storage: "roms", path: "gba/cart.gba" },
            apps: [],
          },
        ],
      }),
    ).toThrow(/Unexpected key|apps/i)

    expect(() =>
      decodeLibraryItemPayload({
        releases: [
          {
            id: "gba",
            system: "gba",
            target: { kind: "file", storage: "roms", path: "gba/cart.gba" },
            apps: [{ id: "retroarch" }, { id: "retroarch" }],
          },
        ],
      }),
    ).toThrow(/Unexpected key|apps/i)
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
