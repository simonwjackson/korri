import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import {
  decodeGameRecord,
  GameRecord,
  getGameDisplayName,
  getGameImageUrl,
} from "./game"

describe("GameRecord schema", () => {
  it("accepts a fully populated record", () => {
    const input = {
      id: "g-001",
      metadata: {
        name: "Crystalline Drift",
        description: "Lorem ipsum.",
        developer: "Studio Nimbus",
        publisher: "Cumulus Games",
        releaseDate: "2024-09-12",
        genre: ["Puzzle", "Adventure"],
        tags: ["chill", "single-player"],
        media: [
          { type: "image", uri: "/img/cd-cover.jpg" },
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
    expect(() => decodeGameRecord({ id: "minimal" })).not.toThrow()
  })

  it("rejects a record with an unknown media type", () => {
    expect(() =>
      decodeGameRecord({
        id: "bad",
        metadata: {
          media: [{ type: "hologram", uri: "/x" }],
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
      metadata: {
        media: [
          { type: "video", uri: "/v.mp4" },
          { type: "image", uri: "/i.jpg" },
        ],
      },
    }
    expect(getGameImageUrl(game)).toBe("/i.jpg")
  })

  it("getGameImageUrl returns undefined when no image media exists", () => {
    const game: GameRecord = {
      id: "g",
      metadata: { media: [{ type: "video", uri: "/v.mp4" }] },
    }
    expect(getGameImageUrl(game)).toBeUndefined()
  })

  it("getGameDisplayName falls back to id when name is absent", () => {
    expect(getGameDisplayName({ id: "fallback" })).toBe("fallback")
  })

  it("decoder is a thin wrapper over Schema.decodeUnknownSync", () => {
    const decoded = Schema.decodeUnknownSync(GameRecord)({ id: "x" })
    expect(decoded.id).toBe("x")
  })
})
