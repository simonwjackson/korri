import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateLevelFile, validateYfsWebroot } from "./validate"

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.map(root => rm(root, { recursive: true, force: true })),
  )
  tempRoots.length = 0
})

async function tempRoot(): Promise<string> {
  const root = join(tmpdir(), `korri-yfs-validate-${crypto.randomUUID()}`)
  tempRoots.push(root)
  await mkdir(join(root, "scripts"), { recursive: true })
  return root
}

async function writeCompatibleWebroot(root: string): Promise<void> {
  await writeFile(
    join(root, "index.html"),
    '<script src="direct-launch-pre.js"></script><script src="scripts/main.js" type="module"></script><script src="direct-launch.js"></script>',
  )
  await writeFile(join(root, "scripts/main.js"), 'exportType:"html5"')
  await writeFile(join(root, "scripts/c3main.js"), "window.__YFSGetSetting")
}

describe("YFS validation", () => {
  it("accepts a compatible webroot and raw JSON level file", async () => {
    const root = await tempRoot()
    await writeCompatibleWebroot(root)
    const level = join(root, "level-source.json")
    await writeFile(level, JSON.stringify({ level: "ok" }))

    expect((await validateYfsWebroot(root)).root).toBe(root)
    expect((await validateLevelFile(level)).digest).toHaveLength(64)
  })

  it("rejects missing webroot hooks and unsupported export markers", async () => {
    const missingHook = await tempRoot()
    await writeFile(
      join(missingHook, "index.html"),
      '<script src="direct-launch-pre.js"></script><script src="scripts/main.js" type="module"></script><script src="direct-launch.js"></script>',
    )
    await writeFile(join(missingHook, "scripts/main.js"), 'exportType:"html5"')
    await writeFile(join(missingHook, "scripts/c3main.js"), "/* no hook */")
    await expect(validateYfsWebroot(missingHook)).rejects.toThrow(
      "__YFSGetSetting",
    )

    const unsupported = await tempRoot()
    await writeCompatibleWebroot(unsupported)
    await writeFile(
      join(unsupported, "scripts/main.js"),
      'exportType:"electron"',
    )
    await expect(validateYfsWebroot(unsupported)).rejects.toThrow(
      "unsupported YFS export marker",
    )
  })

  it("rejects missing, empty, oversized, and invalid JSON level files", async () => {
    const root = await tempRoot()
    await expect(validateLevelFile(join(root, "missing.json"))).rejects.toThrow(
      "level file is not readable",
    )

    const empty = join(root, "empty.json")
    await writeFile(empty, "")
    await expect(validateLevelFile(empty)).rejects.toThrow(
      "level file is empty",
    )

    const invalid = join(root, "invalid.json")
    await writeFile(invalid, "{not-json")
    await expect(validateLevelFile(invalid)).rejects.toThrow(
      "level file is not valid JSON",
    )

    const oversized = join(root, "oversized.json")
    await writeFile(oversized, " ".repeat(9))
    await expect(validateLevelFile(oversized, { maxBytes: 8 })).rejects.toThrow(
      "level file is too large",
    )
  })
})
