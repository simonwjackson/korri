import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { parseGamelist } from "./gamelist"

const FIXTURES_DIR = join(import.meta.dir, "fixtures")

async function loadFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), "utf8")
}

describe("parseGamelist (real ROCKNIX format)", () => {
  it("parses every <game> block from the sample SNES gamelist", async () => {
    const xml = await loadFixture("snes-gamelist.sample.xml")
    const entries = parseGamelist(xml)
    // Four <game> blocks; the <folder> is intentionally skipped.
    expect(entries).toHaveLength(4)
    expect(entries.map(e => e.path)).toEqual([
      "./super-mario-world.smc",
      "./Castle & <Quest>.smc",
      "./minimal.smc",
      "./never-played.smc",
    ])
  })

  it("decodes XML entities in game names and paths", async () => {
    const xml = await loadFixture("snes-gamelist.sample.xml")
    const castle = parseGamelist(xml).find(e =>
      e.path.includes("Castle & <Quest>"),
    )
    expect(castle?.name).toBe("Castle & <Quest>")
  })

  it("decodes <lastplayed> as a UTC Date", async () => {
    const xml = await loadFixture("snes-gamelist.sample.xml")
    const smw = parseGamelist(xml).find(e => e.name === "Super Mario World")
    expect(smw?.lastPlayed).toBeInstanceOf(Date)
    // 2026-05-01T09:18:12 UTC
    expect(smw?.lastPlayed?.getUTCFullYear()).toBe(2026)
    expect(smw?.lastPlayed?.getUTCMonth()).toBe(4) // May (0-indexed)
    expect(smw?.lastPlayed?.getUTCDate()).toBe(1)
    expect(smw?.lastPlayed?.getUTCHours()).toBe(9)
    expect(smw?.lastPlayed?.getUTCMinutes()).toBe(18)
    expect(smw?.lastPlayed?.getUTCSeconds()).toBe(12)
  })

  it("decodes <lastplayed> 19700101T000000 as the Unix epoch (UTC)", async () => {
    const xml = await loadFixture("snes-gamelist.sample.xml")
    const epoch = parseGamelist(xml).find(e =>
      e.path.includes("Castle & <Quest>"),
    )
    expect(epoch?.lastPlayed?.getTime()).toBe(0)
  })

  it("decodes <favorite>true</favorite> to true and false to false", async () => {
    const xml = await loadFixture("snes-gamelist.sample.xml")
    const entries = parseGamelist(xml)
    const fav = entries.find(e => e.name === "Super Mario World")
    const notFav = entries.find(e => e.path.includes("Castle"))
    expect(fav?.favorite).toBe(true)
    expect(notFav?.favorite).toBe(false)
  })

  it("leaves favorite undefined when the field is absent", async () => {
    const xml = await loadFixture("snes-gamelist.sample.xml")
    const minimal = parseGamelist(xml).find(e => e.path === "./minimal.smc")
    expect(minimal?.favorite).toBeUndefined()
  })

  it("includes name + lastPlayed only when the gamelist provides them", async () => {
    const xml = await loadFixture("snes-gamelist.sample.xml")
    const minimal = parseGamelist(xml).find(e => e.path === "./minimal.smc")
    expect(minimal?.name).toBeUndefined()
    expect(minimal?.lastPlayed).toBeUndefined()
    expect(minimal?.playcount).toBeUndefined()

    const neverPlayed = parseGamelist(xml).find(
      e => e.path === "./never-played.smc",
    )
    expect(neverPlayed?.name).toBe("Never Played")
    expect(neverPlayed?.lastPlayed).toBeUndefined()
  })

  it("preserves integer fields", async () => {
    const xml = await loadFixture("snes-gamelist.sample.xml")
    const smw = parseGamelist(xml).find(e => e.name === "Super Mario World")
    expect(smw?.playcount).toBe(4)
    expect(smw?.playtimeSeconds).toBe(1006)
  })

  it("returns [] for empty input", () => {
    expect(parseGamelist("")).toEqual([])
  })

  it("returns [] for input that is not a string", () => {
    // Defensive — a missing-file read might return undefined.
    expect(parseGamelist(undefined as unknown as string)).toEqual([])
  })

  it("returns [] for malformed XML without throwing", () => {
    expect(() => parseGamelist("<gameList><game>broken")).not.toThrow()
    expect(parseGamelist("<gameList><game>broken")).toEqual([])
  })

  it("returns [] for a <gameList> with zero <game> children", () => {
    const xml = `<?xml version="1.0"?><gameList></gameList>`
    expect(parseGamelist(xml)).toEqual([])
  })

  it("ignores <folder> entries even when no <game> exists", () => {
    const xml = `<gameList><folder><path>./x</path><name>x</name></folder></gameList>`
    expect(parseGamelist(xml)).toEqual([])
  })

  it("tolerates missing <?xml ?> prologue (real ports gamelist sometimes omits it)", () => {
    const xml = `<gameList><game><path>./a.smc</path><name>A</name></game></gameList>`
    const entries = parseGamelist(xml)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe("A")
  })

  it("does not throw on a <lastplayed> with unrecognized format", () => {
    const xml = `<gameList><game><path>./a.smc</path><lastplayed>not-a-date</lastplayed></game></gameList>`
    const entries = parseGamelist(xml)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.lastPlayed).toBeUndefined()
  })

  it("skips a <game> that has no <path>", () => {
    const xml = `<gameList><game><name>NoPath</name></game></gameList>`
    expect(parseGamelist(xml)).toEqual([])
  })
})
