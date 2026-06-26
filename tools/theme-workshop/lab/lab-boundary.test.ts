import { describe, expect, it } from "bun:test"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const PRODUCT_ROOT = "product"
const RUNTIME_EXTS = new Set([".ts", ".tsx"])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue
      out.push(...walk(path))
      continue
    }
    if (![...RUNTIME_EXTS].some(ext => path.endsWith(ext))) continue
    if (/\.(test|spec)\.tsx?$/.test(path)) continue
    out.push(path)
  }
  return out
}

describe("lab tooling boundary", () => {
  it("does not let product runtime files import dev-lab runtime modules", () => {
    const offenders = walk(PRODUCT_ROOT).flatMap(path => {
      const text = readFileSync(path, "utf8")
      const importsLab = /from\s+["'][^"']*tools\/theme-workshop\/lab|from\s+["']@tools\/theme-workshop\/lab/.test(text)
      return importsLab ? [relative(process.cwd(), path)] : []
    })

    expect(offenders).toEqual([])
  })

  it("keeps the design-tool preview singletons product-side, not in the lab", () => {
    // The seam that lets the lab drive a mounted surface lives in product (inert
    // in production); the lab consumes it through the adapter, never the reverse.
    const singletons = [
      "product/surfaces/web/shift/shift-catalog-preview.ts",
      "product/surfaces/web/shift/shift-launch-preview.ts",
      "product/surfaces/web/pico/pico-data-preview.ts",
    ]
    for (const path of singletons) {
      expect(existsSync(path)).toBe(true)
    }
  })
})
