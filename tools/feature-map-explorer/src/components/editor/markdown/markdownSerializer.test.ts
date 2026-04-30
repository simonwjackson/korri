import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  canonicalizeMarkdown,
  parseMarkdown,
  serializeMarkdown,
} from "./markdownSerializer"

const FIXTURE_DIR = path.join(
  process.cwd(),
  "tools/feature-map-explorer/src/components/editor/markdown/fixtures",
)

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf-8")
}

function markdownBody(repoRelativePath: string): string {
  return readFileSync(
    path.join(process.cwd(), repoRelativePath),
    "utf-8",
  ).replace(/^---\n[\s\S]*?\n---\n?/, "")
}

function tableRows(markdown: string): string[] {
  return markdown
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("|"))
    .filter(line => !/^\|\s*:?-{3,}/.test(line))
}

describe("markdownSerializer", () => {
  it("parses and serializes the current job body without dropping content", () => {
    const source = fixture("job-body.md")
    const canonical = canonicalizeMarkdown(source)

    expect(canonical).toContain("# Job: Safe Game Resume")
    expect(canonical).toContain("## 1. Job Statement")
    expect(canonical).toContain("Progress safety")
    expect(canonical.length).toBeGreaterThan(1000)
  })

  it("preserves the current brief outcome table semantically", () => {
    const canonical = canonicalizeMarkdown(fixture("brief-body.md"))
    const rows = tableRows(canonical)

    expect(
      rows.some(row => row.includes("ID") && row.includes("Outcome")),
    ).toBe(true)
    for (const id of ["SGR-O1", "SGR-O2", "SGR-O3", "SGR-O4", "SGR-O5"]) {
      expect(rows.some(row => row.includes(id))).toBe(true)
    }
    expect(canonical).toContain("Progress safety")
    expect(canonical).toContain("Retry failed handoff")
  })

  it("supports the focused Markdown construct fixture", () => {
    const canonical = canonicalizeMarkdown(fixture("constructs.md"))

    expect(canonical).toContain("# Construct Coverage")
    expect(canonical).toContain("**bold**")
    expect(canonical).toContain("*italic*")
    expect(canonical).toContain("`inline code`")
    expect(canonical).toContain("- Bullet one")
    expect(canonical).toContain("1. Ordered one")
    expect(canonical).toContain("> A blockquote")
    expect(canonical).toContain("```ts")
    expect(tableRows(canonical).some(row => row.includes("Alpha"))).toBe(true)
  })

  it("handles empty and whitespace-only input without phantom content", () => {
    expect(canonicalizeMarkdown("").trim()).toBe("")
    expect(canonicalizeMarkdown("  \n\t\n").trim()).toBe("")
  })

  it("reaches stable canonical Markdown after one serialization", () => {
    for (const name of ["job-body.md", "brief-body.md", "constructs.md"]) {
      const once = canonicalizeMarkdown(fixture(name))
      const twice = canonicalizeMarkdown(once)
      expect(twice).toBe(once)
    }
  })

  it("keeps the live editable corpus canonically stable", () => {
    for (const repoRelativePath of [
      "docs/jobs/safe-game-resume.md",
      "korri/products/app/features/resume/brief.md",
    ]) {
      const once = canonicalizeMarkdown(markdownBody(repoRelativePath))
      const twice = canonicalizeMarkdown(once)
      expect(twice).toBe(once)
    }
  })

  it("exposes parse and serialize as inverse adapter operations", () => {
    const source = "# Title\n\nBody"
    const parsed = parseMarkdown(source)
    const serialized = serializeMarkdown(parsed)

    expect(serialized).toContain("# Title")
    expect(serialized).toContain("Body")
  })
})
