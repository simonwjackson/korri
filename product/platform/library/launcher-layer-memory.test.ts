import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@platform/library/launcher"
import { Effect } from "effect"
import { makeInMemoryLauncherLayer } from "./launcher-layer-memory"
import { Launcher } from "./library-services"

const spec: LaunchSpec = { command: "in-memory-launcher", args: [] }

const runWith = (layer: ReturnType<typeof makeInMemoryLauncherLayer>) =>
  Effect.gen(function* () {
    const launcher = yield* Launcher
    return yield* launcher.run(spec)
  }).pipe(Effect.provide(layer))

const spawnWith = (layer: ReturnType<typeof makeInMemoryLauncherLayer>) =>
  Effect.gen(function* () {
    const launcher = yield* Launcher
    const spawn = launcher.spawn
    if (!spawn) throw new Error("in-memory launcher missing managed spawn")
    return yield* spawn(spec)
  }).pipe(Effect.provide(layer))

describe("makeInMemoryLauncherLayer", () => {
  it("returns launched for succeed behavior", async () => {
    const result = await Effect.runPromise(
      runWith(makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } })),
    )

    expect(result).toEqual({ status: "launched" })
  })

  it("returns failed with configured exit code and stderr tail", async () => {
    const result = await Effect.runPromise(
      runWith(
        makeInMemoryLauncherLayer({
          behavior: { kind: "fail", exitCode: 7, stderrTail: "boom" },
        }),
      ),
    )

    expect(result).toEqual({
      status: "failed",
      exitCode: 7,
      stderrTail: "boom",
    })
  })

  it("can delay the configured result", async () => {
    const startedAt = Date.now()
    await Effect.runPromise(
      runWith(
        makeInMemoryLauncherLayer({
          behavior: { kind: "succeed", delayMs: 10 },
        }),
      ),
    )

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(8)
  })

  it("can defect for controller error-path tests", async () => {
    const exit = await Effect.runPromiseExit(
      runWith(
        makeInMemoryLauncherLayer({
          behavior: { kind: "defect", defect: "boom" },
        }),
      ),
    )

    expect(exit._tag).toBe("Failure")
  })

  it("can hold a managed launch until the test resolves its exit", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const managed = await Effect.runPromise(
      spawnWith(
        makeInMemoryLauncherLayer({
          behavior: { kind: "managed", control },
        }),
      ),
    )

    expect(managed.status).toBe("started")
    if (managed.status === "started") {
      let settled = false
      void managed.result.then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)

      control.resolveExit({ exitCode: 7, stderrTail: "boom" })
      expect(await managed.session.exited).toEqual({ exitCode: 7 })
      expect(await managed.result).toEqual({
        status: "failed",
        exitCode: 7,
        stderrTail: "boom",
      })
    }
  })

  it("terminates a managed in-memory launch through the handle", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const managed = await Effect.runPromise(
      spawnWith(
        makeInMemoryLauncherLayer({
          behavior: { kind: "managed", control },
        }),
      ),
    )

    expect(managed.status).toBe("started")
    if (managed.status === "started") {
      managed.session.terminate()
      expect(control.signals).toEqual(["SIGTERM"])
      expect(await managed.result).toEqual({ status: "failed", exitCode: 143 })
    }
  })
})
