import { describe, expect, it } from "bun:test"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  type ConfigGraphController,
  type ConfigGraphEvent,
  createConfigGraphController,
} from "./config-graph-controller"

async function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-config-controller-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const validFragment = (title: string, id = "solo") =>
  [
    "library:",
    `  ${id}:`,
    `    title: ${title}`,
    "    releases:",
    "      - id: r1",
    "        system: fixture",
    `        target: fixture/${id}.rom`,
    "",
  ].join("\n")

function waitForEvent(
  controller: ConfigGraphController,
  predicate: (event: ConfigGraphEvent) => boolean,
  timeoutMs = 2000,
): Promise<ConfigGraphEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error("timed out waiting for config event"))
    }, timeoutMs)
    const unsubscribe = controller.subscribe(event => {
      // Ignore the immediate config.ready replay delivered on subscribe.
      if (event.name === "config.ready") return
      if (!predicate(event)) return
      clearTimeout(timeout)
      unsubscribe()
      resolve(event)
    })
  })
}

function expectNoEvent(
  controller: ConfigGraphController,
  windowMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      resolve()
    }, windowMs)
    const unsubscribe = controller.subscribe(event => {
      if (event.name === "config.ready") return
      clearTimeout(timeout)
      unsubscribe()
      reject(new Error(`unexpected config event ${event.name}`))
    })
  })
}

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

  it("re-resolves roots and includes a newly added root's fragments on rebuild", async () => {
    await withRoot(async rootA => {
      await withRoot(async rootB => {
        await writeFile(join(rootA, "a.korri.yaml"), validFragment("Alpha", "alpha"), "utf8")
        let roots = [{ root: rootA }]
        const controller = createConfigGraphController({
          resolveRoots: () => roots,
          watch: false,
        })
        const ready = await controller.initialize()
        expect(ready.files).toEqual(["a.korri.yaml"])

        await writeFile(join(rootB, "b.korri.yaml"), validFragment("Beta", "beta"), "utf8")
        roots = [{ root: rootA }, { root: rootB }]
        const changed = await controller.rebuild()

        expect(changed.name).toBe("config.changed")
        expect(changed.files).toEqual(["a.korri.yaml", "b.korri.yaml"])
        const snapshot = await controller.snapshot()
        expect(snapshot.map(entry => entry.id).sort()).toEqual(["alpha", "beta"])
        await controller.stop()
      })
    })
  })

  it("re-resolves roots and drops a removed root's fragments on rebuild", async () => {
    await withRoot(async rootA => {
      await withRoot(async rootB => {
        await writeFile(join(rootA, "a.korri.yaml"), validFragment("Alpha", "alpha"), "utf8")
        await writeFile(join(rootB, "b.korri.yaml"), validFragment("Beta", "beta"), "utf8")
        let roots = [{ root: rootA }, { root: rootB }]
        const controller = createConfigGraphController({
          resolveRoots: () => roots,
          watch: false,
        })
        await controller.initialize()

        roots = [{ root: rootA }]
        const changed = await controller.rebuild()

        expect(changed.status).toBe("valid")
        expect(changed.files).toEqual(["a.korri.yaml"])
        const snapshot = await controller.snapshot()
        expect(snapshot.map(entry => entry.id)).toEqual(["alpha"])
        await controller.stop()
      })
    })
  })

  it("still rebuilds when the resolved root set is unchanged", async () => {
    await withRoot(async root => {
      await writeFile(join(root, "local.korri.yaml"), validFragment("Same"), "utf8")
      const controller = createConfigGraphController({
        resolveRoots: () => [{ root }],
        watch: false,
      })
      await controller.initialize()
      const changed = await controller.rebuild()
      expect(changed.status).toBe("valid")
      expect(changed.generation).toBe(2)
      await controller.stop()
    })
  })

  it("keeps last-known-good when a re-resolved root makes the graph invalid", async () => {
    await withRoot(async rootA => {
      await withRoot(async rootB => {
        await writeFile(join(rootA, "a.korri.yaml"), validFragment("Good", "alpha"), "utf8")
        await writeFile(
          join(rootB, "bad.korri.yaml"),
          ["library:", "  alpha:", "    releases: not-a-list", ""].join("\n"),
          "utf8",
        )
        let roots = [{ root: rootA }]
        const controller = createConfigGraphController({
          resolveRoots: () => roots,
          watch: false,
        })
        await controller.initialize()

        roots = [{ root: rootA }, { root: rootB }]
        const invalid = await controller.rebuild()

        expect(invalid.name).toBe("config.invalid")
        expect(invalid.generation).toBe(1)
        const snapshot = await controller.snapshot()
        expect(snapshot.find(entry => entry.id === "alpha")?.title).toBe("Good")
        await controller.stop()
      })
    })
  })

  it("serves static roots when the roots signal dir is missing", async () => {
    await withRoot(async root => {
      await writeFile(join(root, "local.korri.yaml"), validFragment("Solo"), "utf8")
      const controller = createConfigGraphController({
        resolveRoots: () => [{ root }],
        rootsSignalDir: join(root, "missing", "config-roots.d"),
        watch: true,
      })
      const ready = await controller.initialize()
      expect(ready.status).toBe("valid")
      expect((await controller.snapshot()).map(entry => entry.id)).toEqual(["solo"])
      await controller.stop()
    })
  })

  it("re-points content watchers at the re-resolved root set after a signal", async () => {
    await withRoot(async rootA => {
      await withRoot(async rootB => {
        await withRoot(async signalDir => {
          await writeFile(join(rootA, "a.korri.yaml"), validFragment("Alpha", "alpha"), "utf8")
          await writeFile(join(rootB, "b.korri.yaml"), validFragment("Beta", "beta"), "utf8")
          let roots = [{ root: rootA }]
          const controller = createConfigGraphController({
            resolveRoots: () => roots,
            rootsSignalDir: signalDir,
            watch: true,
            debounceMs: 25,
          })
          await controller.initialize()

          // Positive control: content changes in the active root rebuild.
          const fromA = waitForEvent(controller, event => event.name === "config.changed")
          await writeFile(join(rootA, "a.korri.yaml"), validFragment("Alpha2", "alpha"), "utf8")
          await fromA

          // Signal a root-set change: rootB replaces rootA.
          roots = [{ root: rootB }]
          const reResolved = waitForEvent(controller, event => event.name === "config.changed")
          await symlink(rootB, join(signalDir, "sdb1"))
          const event = await reResolved
          expect(event.files).toEqual(["b.korri.yaml"])

          // The dropped root is no longer watched...
          const silence = expectNoEvent(controller, 200)
          await writeFile(join(rootA, "a.korri.yaml"), validFragment("Alpha3", "alpha"), "utf8")
          await silence

          // ...while the new root is.
          const fromB = waitForEvent(controller, event => event.name === "config.changed")
          await writeFile(join(rootB, "b.korri.yaml"), validFragment("Beta2", "beta"), "utf8")
          await fromB

          await controller.stop()
        })
      })
    })
  })
})
