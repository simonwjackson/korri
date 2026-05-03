import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

const REPO_ROOT = process.cwd()
const SHARED_ROOT = join(REPO_ROOT, "korri", "shared")
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"])
const IGNORED_PARTS = new Set([".git", ".worktrees", "node_modules", "out"])
const LEGACY_RPC_QUERY_SCAN_EXCLUDES = new Set([
  "tools/testing/standards/import-boundaries.test.ts",
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

function importsProductCode(source: string): boolean {
  return /(?:from\s+["'](?:@app\/|\.\.\/)*products\/|import\s*\(\s*["'](?:@app\/|\.\.\/)*products\/|from\s+["']@app\/|import\s*\(\s*["']@app\/)/.test(
    source,
  )
}

function repoRelative(path: string): string {
  return relative(REPO_ROOT, path).split(sep).join("/")
}

function referencesLegacyRpcQuery(source: string): boolean {
  const uncommented = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
  return /(?:from\s+["'][^"']*(?:runRpc|useRpcQuery|rpcQueryStore)|\buseRpcQuery\s*\(|\brpcQueryStore\b)/.test(
    uncommented,
  )
}

describe("standards: import boundaries", () => {
  it("keeps shared runtime code product-agnostic", () => {
    const violations = sourceFiles(SHARED_ROOT)
      .filter(file => importsProductCode(readFileSync(file, "utf8")))
      .map(file => relative(REPO_ROOT, file))

    expect(violations).toEqual([])
  })

  it("detects product imports in shared-source samples", () => {
    expect(importsProductCode('import { thing } from "@app/api/thing"')).toBe(
      true,
    )
    expect(importsProductCode('import("@app/api/thing")')).toBe(true)
    expect(
      importsProductCode(
        'import { thing } from "../../products/app/api/thing"',
      ),
    ).toBe(true)
    expect(
      importsProductCode('import { thing } from "@shared/api/thing"'),
    ).toBe(false)
  })

  it("keeps deleted custom RPC query helpers out of runtime code", () => {
    const roots = [join(REPO_ROOT, "korri"), join(REPO_ROOT, "tools")]
    const violations = roots.flatMap(root =>
      sourceFiles(root)
        .filter(file => !LEGACY_RPC_QUERY_SCAN_EXCLUDES.has(repoRelative(file)))
        .filter(file => referencesLegacyRpcQuery(readFileSync(file, "utf8")))
        .map(repoRelative),
    )

    expect(violations).toEqual([])
  })
})
