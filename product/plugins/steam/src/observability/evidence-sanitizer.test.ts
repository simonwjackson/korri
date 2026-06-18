import { describe, expect, it } from "bun:test"
import { sanitizeSteamEvidenceExcerpt } from "./evidence-sanitizer"

describe("Steam evidence sanitizer", () => {
  it("redacts sensitive paths, userdata ids, URI query strings, and secret-like keys", () => {
    const excerpt = sanitizeSteamEvidenceExcerpt(
      "run /home/korri/game file:///home/korri/game.exe?token=abc userdata/80924811 SECRET_KEY=abc --password hunter2 KORRI_STEAM_TOKEN=abc",
      { maxLength: 160 },
    )

    expect(excerpt).toContain("/home/<redacted>")
    expect(excerpt).toContain("file://<redacted>")
    expect(excerpt).toContain("userdata/<steam-user-id>")
    expect(excerpt).toContain("SECRET_KEY=<redacted>")
    expect(excerpt).toContain("--password <redacted>")
    expect(excerpt).toContain("KORRI_STEAM_TOKEN=<redacted>")
    expect(excerpt).not.toContain("hunter2")
  })

  it("clamps oversized evidence", () => {
    const excerpt = sanitizeSteamEvidenceExcerpt("x".repeat(500), {
      maxLength: 32,
    })

    expect(excerpt.length).toBeLessThanOrEqual(33)
    expect(excerpt.endsWith("…")).toBe(true)
  })
})
