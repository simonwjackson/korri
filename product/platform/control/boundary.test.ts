import { describe, expect, it } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

const controlRoot = new URL("./", import.meta.url).pathname

describe("product/platform/control boundary", () => {
  it("does not import product app or Pi extension code", async () => {
    const files = await tsFiles(controlRoot)
    const offenders: string[] = []

    for (const file of files) {
      const text = await readFile(file, "utf8")
      if (
        text.includes("@product/apps/") ||
        text.includes("product/apps/") ||
        text.includes(".pi/")
      ) {
        offenders.push(file.replace(controlRoot, ""))
      }
    }

    expect(offenders).toEqual([])
  })
})

async function tsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async entry => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return await tsFiles(path)
      return entry.isFile() &&
        path.endsWith(".ts") &&
        !path.endsWith(".test.ts")
        ? [path]
        : []
    }),
  )
  return nested.flat()
}
