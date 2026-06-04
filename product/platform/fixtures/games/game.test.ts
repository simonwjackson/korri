import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import {
  decodeGameRecord,
  GameRecord,
  getGameDisplayName,
  getGameImageUrl,
  getGameWideImageUrl,
  type ResolvedGameRecord,
} from "./game"

describe("GameRecord schema", () => {
  it("accepts a fully populated record", () => {
    const input = {
      id: "g-001",
      system: "fixture",
      contentPath: "/storage/fixtures/g-001.rom",
      metadata: {
        name: "Crystalline Drift",
        description: "Lorem ipsum.",
        developer: "Studio Nimbus",
        publisher: "Cumulus Games",
        releaseDate: "2024-09-12",
        genre: ["Puzzle", "Adventure"],
        tags: ["chill", "single-player"],
      },
      userData: {
        lastPlayed: new Date("2025-03-01T12:00:00.000Z"),
        playtime: 320,
        favorite: true,
      },
    }

    expect(() => decodeGameRecord(input)).not.toThrow()
  })

  it("accepts a record with only an id", () => {
    expect(() =>
      decodeGameRecord({
        id: "minimal",
        system: "fixture",
        contentPath: "/storage/fixtures/minimal.rom",
      }),
    ).not.toThrow()
  })

  it("rejects persisted media entries", () => {
    expect(() =>
      decodeGameRecord({
        id: "legacy-media",
        system: "fixture",
        contentPath: "/storage/fixtures/legacy-media.rom",
        metadata: {
          media: [{ type: "image", uri: "/img/cd-cover.jpg" }],
        },
      }),
    ).toThrow()
  })

  it("rejects persisted Korri delivery URLs", () => {
    expect(() =>
      decodeGameRecord({
        id: "legacy-delivery-url",
        system: "fixture",
        contentPath: "/storage/fixtures/legacy-delivery-url.rom",
        metadata: {
          media: [
            {
              type: "image",
              uri: "/api/media/games/wii/g/banner-460x215.png",
            },
          ],
        },
      }),
    ).toThrow()
  })

  it("rejects a record without an id", () => {
    expect(() => decodeGameRecord({ metadata: { name: "x" } })).toThrow()
  })
})

describe("game helpers", () => {
  it("getGameImageUrl returns the first resolved image URL", () => {
    const game = resolvedGame({
      media: [resolvedMedia("poster", "https://assets.example/poster.jpg")],
    })
    expect(getGameImageUrl(game)).toBe("https://assets.example/poster.jpg")
  })

  it("getGameImageUrl prefers explicit tile resolved media", () => {
    const game = resolvedGame({
      media: [
        resolvedMedia("poster", "https://assets.example/poster.jpg"),
        resolvedMedia("tile", "https://assets.example/tile.jpg"),
      ],
    })
    expect(getGameImageUrl(game)).toBe("https://assets.example/tile.jpg")
  })

  it("getGameImageUrl returns undefined when no resolved image media exists", () => {
    expect(getGameImageUrl(resolvedGame({}))).toBeUndefined()
  })

  it("getGameWideImageUrl prefers explicit banner resolved media", () => {
    const game = resolvedGame({
      media: [
        resolvedMedia("tile", "https://assets.example/tile.jpg"),
        resolvedMedia("banner", "https://assets.example/banner.jpg"),
      ],
    })
    expect(getGameWideImageUrl(game)).toBe("https://assets.example/banner.jpg")
  })

  it("getGameWideImageUrl falls back to tile resolved media", () => {
    const game = resolvedGame({
      media: [resolvedMedia("tile", "https://assets.example/tile.jpg")],
    })
    expect(getGameWideImageUrl(game)).toBe("https://assets.example/tile.jpg")
  })

  it("getGameDisplayName falls back to id when name is absent", () => {
    expect(
      getGameDisplayName({
        id: "fallback",
        system: "fixture",
        contentPath: "/storage/fixtures/fallback.rom",
      }),
    ).toBe("fallback")
  })

  it("decoder is a thin wrapper over Schema.decodeUnknownSync", () => {
    const decoded = Schema.decodeUnknownSync(GameRecord)({
      id: "x",
      system: "fixture",
      contentPath: "/storage/fixtures/x.rom",
    })
    expect(decoded.id).toBe("x")
  })
})

function resolvedGame(
  overrides: Partial<Pick<ResolvedGameRecord, "media">>,
): ResolvedGameRecord {
  return {
    id: "g",
    system: "fixture",
    contentPath: "/storage/fixtures/g.rom",
    ...overrides,
  }
}

type ResolvedMedia = NonNullable<ResolvedGameRecord["media"]>[number]

function resolvedMedia(
  role: ResolvedMedia["role"],
  url: string,
): ResolvedMedia {
  return {
    role,
    type: "image",
    width: 512,
    height: 512,
    assetId:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    url,
  }
}
