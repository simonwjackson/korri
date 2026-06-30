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
      const importsLab =
        /from\s+["'][^"']*tools\/theme-workshop\/lab|from\s+["']@tools\/theme-workshop\/lab/.test(
          text,
        )
      return importsLab ? [relative(process.cwd(), path)] : []
    })

    expect(offenders).toEqual([])
  })

  it("keeps any remaining transitional preview singletons product-side, not in the lab", () => {
    // Transitional seams that still exist live in product (inert in production);
    // the lab consumes them through the adapter, never the reverse. Shift no
    // longer uses preview singleton render paths.
    const singletons = ["product/surfaces/web/pico/pico-data-preview.ts"]
    for (const path of singletons) {
      expect(existsSync(path)).toBe(true)
    }
  })
})
