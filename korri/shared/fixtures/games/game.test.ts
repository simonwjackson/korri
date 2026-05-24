import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import {
  decodeGameRecord,
  GameRecord,
  getGameDisplayName,
  getGameImageUrl,
  getGameWideImageUrl,
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
        media: [
          {
            type: "image",
            uri: "/img/cd-cover.jpg",
            role: "poster",
            width: 600,
            height: 900,
            source: {
              provider: "steamgriddb",
              id: "12345",
              url: "https://cdn.steamgriddb.com/grid/example.jpg",
            },
          },
          { type: "video", uri: "/video/cd-trailer.mp4" },
        ],
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

  it("rejects a record with an unknown media type", () => {
    expect(() =>
      decodeGameRecord({
        id: "bad",
        system: "fixture",
        contentPath: "/storage/fixtures/bad.rom",
        metadata: {
          media: [{ type: "hologram", uri: "/x" }],
        },
      }),
    ).toThrow()
  })

  it("rejects a record with an unknown media role", () => {
    expect(() =>
      decodeGameRecord({
        id: "bad-role",
        system: "fixture",
        contentPath: "/storage/fixtures/bad-role.rom",
        metadata: {
          media: [{ type: "image", uri: "/x", role: "thumbnail" }],
        },
      }),
    ).toThrow()
  })

  it("rejects a record without an id", () => {
    expect(() => decodeGameRecord({ metadata: { name: "x" } })).toThrow()
  })
})

describe("game helpers", () => {
  it("getGameImageUrl returns the first image URI", () => {
    const game: GameRecord = {
      id: "g",
      system: "fixture",
      contentPath: "/storage/fixtures/g.rom",
      metadata: {
        media: [
          { type: "video", uri: "/v.mp4" },
          { type: "image", uri: "/i.jpg" },
        ],
      },
    }
    expect(getGameImageUrl(game)).toBe("/i.jpg")
  })

  it("getGameImageUrl prefers tile media", () => {
    const game: GameRecord = {
      id: "g",
      system: "fixture",
      contentPath: "/storage/fixtures/g.rom",
      metadata: {
        media: [
          { type: "image", role: "poster", uri: "/poster.jpg" },
          { type: "image", role: "tile", uri: "/tile.jpg" },
        ],
      },
    }
    expect(getGameImageUrl(game)).toBe("/tile.jpg")
  })

  it("getGameImageUrl returns undefined when no image media exists", () => {
    const game: GameRecord = {
      id: "g",
      system: "fixture",
      contentPath: "/storage/fixtures/g.rom",
      metadata: { media: [{ type: "video", uri: "/v.mp4" }] },
    }
    expect(getGameImageUrl(game)).toBeUndefined()
  })

  it("getGameWideImageUrl prefers banner-role image media", () => {
    const game: GameRecord = {
      id: "g",
      system: "fixture",
      contentPath: "/storage/fixtures/g.rom",
      metadata: {
        media: [
          { type: "image", role: "tile", uri: "/tile.jpg" },
          { type: "image", role: "banner", uri: "/banner.jpg" },
        ],
      },
    }
    expect(getGameWideImageUrl(game)).toBe("/banner.jpg")
  })

  it("getGameWideImageUrl prefers wide image media by filename", () => {
    const game: GameRecord = {
      id: "g",
      system: "fixture",
      contentPath: "/storage/fixtures/g.rom",
      metadata: {
        media: [
          { type: "image", uri: "/api/media/games/wii/g/cover-1024.jpg" },
          { type: "image", uri: "/api/media/games/wii/g/poster-600x900.png" },
          { type: "image", uri: "/api/media/games/wii/g/banner-460x215.png" },
        ],
      },
    }
    expect(getGameWideImageUrl(game)).toBe(
      "/api/media/games/wii/g/banner-460x215.png",
    )
  })

  it("getGameWideImageUrl falls back to cover image media", () => {
    const game: GameRecord = {
      id: "g",
      system: "fixture",
      contentPath: "/storage/fixtures/g.rom",
      metadata: {
        media: [
          { type: "image", uri: "/api/media/games/wii/g/poster-600x900.png" },
          { type: "image", uri: "/api/media/games/wii/g/cover-1024.jpg" },
        ],
      },
    }
    expect(getGameWideImageUrl(game)).toBe(
      "/api/media/games/wii/g/cover-1024.jpg",
    )
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
