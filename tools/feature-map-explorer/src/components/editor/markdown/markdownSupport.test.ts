import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { analyzeMarkdownSupport } from "./markdownSupport"

const FIXTURE_DIR = path.join(
  process.cwd(),
  "tools/feature-map-explorer/src/components/editor/markdown/fixtures",
)

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf-8")
}

describe("analyzeMarkdownSupport", () => {
  it("supports the current job body fixture", () => {
    const result = analyzeMarkdownSupport(fixture("job-body.md"))
    expect(result.level).toBe("supported")
    expect(result.reasons).toEqual([])
  })

  it("supports the current brief body fixture with a GFM table", () => {
    const result = analyzeMarkdownSupport(fixture("brief-body.md"))
    expect(result.level).toBe("supported")
    expect(result.reasons).toEqual([])
  })

  it("supports ordinary fenced code blocks", () => {
    const result = analyzeMarkdownSupport("```ts\nconst x = 1\n```\n")
    expect(result.level).toBe("supported")
    expect(result.reasons).toEqual([])
  })

  it("returns raw-only for raw HTML blocks", () => {
    const result = analyzeMarkdownSupport('<section class="x">HTML</section>')
    expect(result.level).toBe("raw-only")
    expect(result.reasons).toContain(
      "Raw HTML blocks are not supported in Rich mode.",
    )
  })

  it("returns raw-only for MDX-like JSX", () => {
    const result = analyzeMarkdownSupport('<Widget name="Resume" />')
    expect(result.level).toBe("raw-only")
    expect(result.reasons).toContain(
      "MDX/JSX tags are not supported in Rich mode.",
    )
  })

  it("returns raw-only for footnotes, definition lists, mermaid fences, and images", () => {
    const result = analyzeMarkdownSupport(fixture("unsupported.md"))
    expect(result.level).toBe("raw-only")
    expect(result.reasons).toContain(
      "Footnotes are not supported in Rich mode.",
    )
    expect(result.reasons).toContain(
      "Definition lists are not supported in Rich mode.",
    )
    expect(result.reasons).toContain(
      "Mermaid diagrams are not supported in Rich mode.",
    )
    expect(result.reasons).toContain("Images are not supported in Rich mode.")
  })
})
