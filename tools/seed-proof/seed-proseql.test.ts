import { describe, expect, it } from "bun:test"
import { DEV_GAME_MEDIA } from "@product/surfaces/web/shift/dev-game-media"
import { Effect } from "effect"
import { makeSeededProseqlLibrarySource } from "./seed-proseql"

describe("makeSeededProseqlLibrarySource", () => {
  it("seeds the real in-memory ProseQL db and lists playable entries with media", async () => {
    const source = await makeSeededProseqlLibrarySource(
      DEV_GAME_MEDIA.slice(0, 2),
    )

    const listPlayableEntries = source.listPlayableEntries
    expect(listPlayableEntries).toBeDefined()
    if (!listPlayableEntries)
      throw new Error("seed source did not expose playable entries")

    const entries = await Effect.runPromise(listPlayableEntries())

    expect(entries.map(entry => entry.title)).toEqual([
      "Hollow Knight",
      "Celeste",
    ])
    expect(entries[0]?.media?.map(media => media.role)).toEqual([
      "tile",
      "banner",
    ])
  })
})
