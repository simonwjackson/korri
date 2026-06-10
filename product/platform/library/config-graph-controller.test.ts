import { describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createConfigGraphController } from "./config-graph-controller"

async function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-config-controller-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const validFragment = (title: string) =>
  [
    "library:",
    "  solo:",
    `    title: ${title}`,
    "    releases:",
    "      - id: r1",
    "        system: fixture",
    "        target: fixture/solo.rom",
    "",
  ].join("\n")

describe("createConfigGraphController", () => {
  it("starts valid with generation 1 and an empty-baseline snapshot path", async () => {
    await withRoot(async root => {
      await writeFile(join(root, "local.korri.yaml"), validFragment("Solo"), "utf8")
      const controller = createConfigGraphController({
        roots: [{ root }],
        watch: false,
      })
      const ready = await controller.initialize()
      expect(ready.name).toBe("config.ready")
      expect(ready.status).toBe("valid")
      expect(ready.generation).toBe(1)
      expect(ready.attempt).toBe(1)
      const snapshot = await controller.snapshot()
      expect(snapshot.map(entry => entry.id)).toContain("solo")
      await controller.stop()
    })
  })

  it("treats an empty graph as a valid empty baseline", async () => {
    const controller = createConfigGraphController({ roots: [], watch: false })
    const ready = await controller.initialize()
    expect(ready.status).toBe("valid")
    expect(ready.generation).toBe(1)
    expect((await controller.snapshot()).length).toBe(0)
    await controller.stop()
  })

  it("starts degraded with generation 0 when initial config is invalid", async () => {
    await withRoot(async root => {
      await writeFile(
        join(root, "bad.korri.yaml"),
        ["launchTargets:", "  bad:", "    gameId: x", ""].join("\n"),
        "utf8",
      )
      const controller = createConfigGraphController({
        roots: [{ root }],
        watch: false,
      })
      const ready = await controller.initialize()
      expect(ready.status).toBe("invalid")
      expect(ready.generation).toBe(0)
      expect(ready.message).toBeDefined()
      // Degraded startup serves an empty baseline rather than crashing.
      expect((await controller.snapshot()).length).toBe(0)
      await controller.stop()
    })
  })

  it("advances generation and emits config.changed on a valid rebuild", async () => {
    await withRoot(async root => {
      await writeFile(join(root, "local.korri.yaml"), validFragment("First"), "utf8")
      const controller = createConfigGraphController({
        roots: [{ root }],
        watch: false,
      })
      await controller.initialize()

      const events: string[] = []
      controller.subscribe(event => events.push(event.name))

      await writeFile(join(root, "local.korri.yaml"), validFragment("Second"), "utf8")
      const changed = await controller.rebuild("local.korri.yaml")

      expect(changed.name).toBe("config.changed")
      expect(changed.status).toBe("valid")
      expect(changed.generation).toBe(2)
      expect(changed.attempt).toBe(2)
      expect(changed.changedPath).toBe("local.korri.yaml")
      const snapshot = await controller.snapshot()
      expect(snapshot.find(entry => entry.id === "solo")?.title).toBe("Second")
      await controller.stop()
    })
  })

  it("retains last-known-good and emits config.invalid on a bad rebuild", async () => {
    await withRoot(async root => {
      await writeFile(join(root, "local.korri.yaml"), validFragment("Good"), "utf8")
      const controller = createConfigGraphController({
        roots: [{ root }],
        watch: false,
      })
      await controller.initialize()

      await writeFile(
        join(root, "local.korri.yaml"),
        ["library:", "  solo:", "    releases: not-a-list", ""].join("\n"),
        "utf8",
      )
      const invalid = await controller.rebuild("local.korri.yaml")

      expect(invalid.name).toBe("config.invalid")
      expect(invalid.status).toBe("invalid")
      // Generation is retained at the last good value.
      expect(invalid.generation).toBe(1)
      expect(invalid.attempt).toBe(2)
      expect(invalid.message).toBeDefined()
      // RPC reads keep serving the prior good catalog.
      const snapshot = await controller.snapshot()
      expect(snapshot.find(entry => entry.id === "solo")?.title).toBe("Good")
      await controller.stop()
    })
  })

  it("delivers config.ready immediately to new subscribers", async () => {
    const controller = createConfigGraphController({ roots: [], watch: false })
    await controller.initialize()
    const received: string[] = []
    const unsubscribe = controller.subscribe(event => received.push(event.name))
    expect(received).toEqual(["config.ready"])
    unsubscribe()
    await controller.stop()
  })
})
