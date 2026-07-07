import { describe, expect, it } from "bun:test"
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import { shiftHomeGamesFromCatalog } from "./ShiftHomeRoute"

// Minimal catalog entries: the section builder only reads playStats + the fields
// toCinematicGame tolerates as absent, so a partial cast is enough here.
function entry(
  id: string,
  playStats?: { lastPlayed?: Date; playCount?: number },
): CatalogEntry {
  return {
    id,
    title: id.toUpperCase(),
    metadata: { name: id.toUpperCase() },
    ...(playStats ? { playStats } : {}),
  } as unknown as CatalogEntry
}

// Deterministic Random pick: always the first candidate.
const pickFirst = () => 0

describe("shiftHomeGamesFromCatalog", () => {
  it("builds Recent (newest first) and a single Random pick not in Recent", () => {
    const games = shiftHomeGamesFromCatalog(
      [
        entry("old", {
          lastPlayed: new Date("2026-01-01T00:00:00.000Z"),
          playCount: 3,
        }),
        entry("new", {
          lastPlayed: new Date("2026-07-01T00:00:00.000Z"),
          playCount: 1,
        }),
        entry("neverA"),
        entry("neverB", { playCount: 0 }),
      ],
      pickFirst,
    )

    const recent = games.filter(g => g.section === "Recent")
    const random = games.filter(g => g.section === "Random")

    expect(recent.map(g => g.id)).toEqual(["new", "old"])
    expect(random).toHaveLength(1)
    // Random is drawn from games NOT in Recent.
    expect(recent.map(g => g.id)).not.toContain(random[0]?.id)
    expect(["neverA", "neverB"]).toContain(random[0]?.id)
    // Recent comes first, Random is the tail.
    expect(games.at(-1)?.section).toBe("Random")
  })

  it("caps Recent at 8", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      entry(`played-${i}`, {
        lastPlayed: new Date(
          `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        ),
        playCount: 1,
      }),
    )
    const games = shiftHomeGamesFromCatalog(many, pickFirst)
    expect(games.filter(g => g.section === "Recent")).toHaveLength(8)
  })

  it("omits Random when every game is already in Recent", () => {
    const games = shiftHomeGamesFromCatalog(
      [
        entry("a", {
          lastPlayed: new Date("2026-01-01T00:00:00.000Z"),
          playCount: 1,
        }),
      ],
      pickFirst,
    )
    expect(games.filter(g => g.section === "Random")).toHaveLength(0)
  })
})
