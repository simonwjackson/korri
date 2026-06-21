import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareYfsLaunchRoot } from "./cache"

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.map(root => rm(root, { recursive: true, force: true })),
  )
  tempRoots.length = 0
})

async function tempRoot(name: string): Promise<string> {
  const root = join(tmpdir(), `korri-yfs-${name}-${crypto.randomUUID()}`)
  tempRoots.push(root)
  await mkdir(root, { recursive: true })
  return root
}

async function writeWebroot(
  root: string,
  marker = 'exportType:"windows-webview2"',
): Promise<void> {
  await mkdir(join(root, "scripts"), { recursive: true })
  await writeFile(
    join(root, "index.html"),
    '<script src="scripts/main.js" type="module"></script>',
  )
  await writeFile(join(root, "scripts/main.js"), marker)
  await writeFile(join(root, "scripts/c3main.js"), "window.__YFSGetSetting")
}

describe("YFS prepared root cache", () => {
  it("builds a prepared root with level.json, manifest, and normalized export marker", async () => {
    const webroot = await tempRoot("webroot")
    const cacheRoot = await tempRoot("cache")
    await writeWebroot(webroot)
    const level = join(webroot, "source-level.json")
    await writeFile(level, JSON.stringify({ level: "one" }))

    const prepared = await prepareYfsLaunchRoot({
      webroot,
      levelFile: level,
      cacheRoot,
      settings: { metrics: true },
      launcherVersion: "test",
    })

    expect(await Bun.file(join(prepared.root, "index.html")).exists()).toBe(
      true,
    )
    expect(await readFile(join(prepared.root, "level.json"), "utf8")).toBe(
      JSON.stringify({ level: "one" }),
    )
    expect(
      await readFile(join(prepared.root, "scripts/main.js"), "utf8"),
    ).toContain('exportType:"html5"')
    expect(
      await Bun.file(join(prepared.root, ".korri-yfs-ready")).exists(),
    ).toBe(true)
    expect(prepared.rebuilt).toBe(true)
  })

  it("reuses identical inputs and separates different settings", async () => {
    const webroot = await tempRoot("webroot")
    const cacheRoot = await tempRoot("cache")
    await writeWebroot(webroot, 'exportType:"html5"')
    const level = join(webroot, "source-level.json")
    await writeFile(level, JSON.stringify({ level: "one" }))

    const first = await prepareYfsLaunchRoot({
      webroot,
      levelFile: level,
      cacheRoot,
      settings: { metrics: true },
      launcherVersion: "test",
    })
    const second = await prepareYfsLaunchRoot({
      webroot,
      levelFile: level,
      cacheRoot,
      settings: { metrics: true },
      launcherVersion: "test",
    })
    const different = await prepareYfsLaunchRoot({
      webroot,
      levelFile: level,
      cacheRoot,
      settings: { metrics: false },
      launcherVersion: "test",
    })

    expect(second.root).toBe(first.root)
    expect(second.rebuilt).toBe(false)
    expect(different.root).not.toBe(first.root)
  })

  it("rebuilds an incomplete prepared root once", async () => {
    const webroot = await tempRoot("webroot")
    const cacheRoot = await tempRoot("cache")
    await writeWebroot(webroot, 'exportType:"html5"')
    const level = join(webroot, "source-level.json")
    await writeFile(level, JSON.stringify({ level: "one" }))

    const first = await prepareYfsLaunchRoot({
      webroot,
      levelFile: level,
      cacheRoot,
      settings: {},
      launcherVersion: "test",
    })
    await rm(join(first.root, ".korri-yfs-ready"))
    const rebuilt = await prepareYfsLaunchRoot({
      webroot,
      levelFile: level,
      cacheRoot,
      settings: {},
      launcherVersion: "test",
    })

    expect(rebuilt.root).toBe(first.root)
    expect(rebuilt.rebuilt).toBe(true)
    expect(
      await Bun.file(join(rebuilt.root, ".korri-yfs-ready")).exists(),
    ).toBe(true)
  })
})
