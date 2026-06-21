import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appShimDocumentSentinel, prepareCanvasStartupScripts } from "./canvas"

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.map(root => rm(root, { recursive: true, force: true })),
  )
  tempRoots.length = 0
})

async function tempShim(name: string, source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "korri-canvas-test-"))
  tempRoots.push(root)
  const path = join(root, name)
  await writeFile(path, source)
  return path
}

describe("canvas startup scripts", () => {
  it("prepares presentation before ordered app shims", async () => {
    const first = await tempShim("first.js", "window.order.push('first')")
    const second = await tempShim("second.js", "window.order.push('second')")

    const scripts = await prepareCanvasStartupScripts({
      background: "#000",
      shim: [first, second],
    })

    expect(scripts.map(script => script.kind)).toEqual([
      "presentation",
      "app-shim",
      "app-shim",
    ])
    expect(scripts[1]?.source).toContain("window.order.push('first')")
    expect(scripts[2]?.source).toContain("window.order.push('second')")
  })

  it("wraps app shims with once-per-document sentinels", async () => {
    const first = await tempShim(
      "first.js",
      "window.sideEffects = (window.sideEffects || 0) + 1",
    )
    const scripts = await prepareCanvasStartupScripts({ shim: [first] })
    const source = scripts.find(script => script.kind === "app-shim")?.source

    expect(source).toContain(appShimDocumentSentinel(0))
    expect(source).toContain("window.sideEffects")
    expect(source).toContain("Object.defineProperty(window")
  })

  it("fails when an app shim cannot be read", async () => {
    await expect(
      prepareCanvasStartupScripts({
        shim: ["/definitely/missing/yfs-shim.js"],
      }),
    ).rejects.toThrow("unable to read canvas app shim")
  })
})
