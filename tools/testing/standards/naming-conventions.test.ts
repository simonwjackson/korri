import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

const REPO_ROOT = process.cwd()
const SCAN_ROOTS = [join(REPO_ROOT, "product"), join(REPO_ROOT, "tools")]
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"])
const IGNORED_PARTS = new Set([".git", ".worktrees", "node_modules", "out"])
const ALLOWLISTED_FILES = new Set([
  // The executable fixture intentionally keeps its long-standing name and env
  // contract; source identifiers should still avoid faux-double prefixes.
  "tools/testing/fake-game.test.ts",
])

function sourceFiles(root: string): readonly string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (IGNORED_PARTS.has(entry)) continue
      const path = join(dir, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) {
        walk(path)
        continue
      }
      if ([...SOURCE_EXTENSIONS].some(ext => path.endsWith(ext))) {
        files.push(path)
      }
    }
  }
  walk(root)
  return files
}

function repoRelative(path: string): string {
  return relative(REPO_ROOT, path).split(sep).join("/")
}

function hasConfiguredDoublePrefix(source: string): boolean {
  return /\b(?:(?:Mock|Stub|Fake)[A-Z][A-Za-z0-9_]*|(?:mock|stub|fake)[A-Z][A-Za-z0-9_]*)\b/.test(
    source,
  )
}

describe("standards: configured-real naming", () => {
  it("keeps source identifiers free of faux-double prefixes", () => {
    const violations = SCAN_ROOTS.flatMap(root =>
      sourceFiles(root)
        .filter(file => !ALLOWLISTED_FILES.has(repoRelative(file)))
        .filter(file => hasConfiguredDoublePrefix(readFileSync(file, "utf8")))
        .map(repoRelative),
    )

    expect(violations).toEqual([])
  })

  it("detects disallowed configured-double names in samples", () => {
    const upper = ["Mock", "Thing"].join("")
    const lower = ["stub", "Thing"].join("")

    expect(hasConfiguredDoublePrefix(`class ${upper} {}`)).toBe(true)
    expect(hasConfiguredDoublePrefix(`const ${lower} = {}`)).toBe(true)
    expect(hasConfiguredDoublePrefix("const configuredThing = {}")).toBe(false)
  })
})
