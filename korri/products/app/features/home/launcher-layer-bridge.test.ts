import { describe, expect, it } from "bun:test"
import { Launcher } from "@shared/library/library-services"
import { Effect } from "effect"
import { LauncherLayerBridge } from "./launcher-layer-bridge"

async function runBridgeLauncher(responseBody: unknown) {
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch
  try {
    return await Effect.runPromise(
      Effect.gen(function* () {
        const launcher = yield* Launcher
        return yield* launcher.run({ command: "gba/wario-land-4", args: [] })
      }).pipe(Effect.provide(LauncherLayerBridge)),
    )
  } finally {
    globalThis.fetch = previousFetch
  }
}

describe("LauncherLayerBridge", () => {
  it("returns a typed Moonlight failure when the desktop bridge prepared but could not stream", async () => {
    const result = await runBridgeLauncher({
      status: "prepared-no-moonlight",
      gameId: "gba/wario-land-4",
      message: "Moonlight exited early with status 42",
    })

    expect(result).toEqual({
      status: "failed",
      exitCode: 125,
      stderrTail: "Moonlight exited early with status 42",
      failureKind: "moonlight-failed",
    })
  })

  it("returns typed server failure categories from failed bridge responses", async () => {
    const result = await runBridgeLauncher({
      status: "failed",
      category: "prepare-failed",
      message: "server could not prepare stream",
    })

    expect(result).toEqual({
      status: "failed",
      exitCode: 1,
      stderrTail: "server could not prepare stream",
      failureKind: "prepare-failed",
    })
  })
})
