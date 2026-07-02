import { describe, expect, it } from "bun:test"
import { parseCandidates } from "./design-takes-client"

describe("design takes client", () => {
  it("parses valid recipe candidates from a workflow response", () => {
    const raw = JSON.stringify({
      takes: [
        {
          name: "Gallery Calm",
          summary: "Airy and hushed.",
          recipe: {
            kind: "shift-status-bar-take-v1",
            density: "airy",
            tone: "quiet",
            batteryEmphasis: "low",
            networkEmphasis: "low",
          },
        },
      ],
    })

    const candidates = parseCandidates(raw)
    expect(candidates).toHaveLength(1)
    expect(candidates?.[0]?.name).toBe("Gallery Calm")
    expect(candidates?.[0]?.recipe.density).toBe("airy")
  })

  it("drops candidates with an invalid recipe and returns null when none remain", () => {
    const raw = JSON.stringify({
      takes: [
        { name: "Bad", summary: "no recipe" },
        {
          name: "Bad2",
          summary: "bad enum",
          recipe: {
            kind: "shift-status-bar-take-v1",
            density: "spacious",
            tone: "quiet",
            batteryEmphasis: "low",
            networkEmphasis: "low",
          },
        },
      ],
    })
    expect(parseCandidates(raw)).toBeNull()
  })

  it("returns null for malformed or empty payloads", () => {
    expect(parseCandidates(null)).toBeNull()
    expect(parseCandidates("not json")).toBeNull()
    expect(parseCandidates(JSON.stringify({ takes: [] }))).toBeNull()
    expect(parseCandidates(JSON.stringify({ notTakes: 1 }))).toBeNull()
  })
})
