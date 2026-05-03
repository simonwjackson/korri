import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@shared/library/launcher"
import { Effect } from "effect"
import { makeInMemoryLauncherLayer } from "./launcher-layer-memory"
import { Launcher } from "./library-services"

const spec: LaunchSpec = { command: "in-memory-launcher", args: [] }

const runWith = (layer: ReturnType<typeof makeInMemoryLauncherLayer>) =>
  Effect.gen(function* () {
    const launcher = yield* Launcher
    return yield* launcher.run(spec)
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
})
