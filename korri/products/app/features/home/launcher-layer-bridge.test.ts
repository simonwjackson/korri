import { describe, expect, it } from "bun:test"
import type { LocalStreamLaunchResponse } from "@app/stream/local-stream-launch-rpc"
import { Launcher } from "@shared/library/library-services"
import { Effect } from "effect"
import { createLauncherLayerBridge } from "./launcher-layer-bridge"

async function runLauncherWithResponse(response: LocalStreamLaunchResponse) {
  return await runLauncherWithClient(async () => response)
}

async function runLauncherWithClient(
  launchGame: (gameId: string) => Promise<LocalStreamLaunchResponse>,
) {
  return await Effect.runPromise(
    Effect.gen(function* () {
      const launcher = yield* Launcher
      return yield* launcher.run({ command: "gba/wario-land-4", args: [] })
    }).pipe(
      Effect.provide(createLauncherLayerBridge({ client: { launchGame } })),
    ),
  )
}

describe("LauncherLayerBridge", () => {
  it("sends the selected game id through the typed desktop launch client", async () => {
    let launchedGameId: string | undefined

    const result = await runLauncherWithClient(async gameId => {
      launchedGameId = gameId
      return {
        status: "launched",
        gameId,
        moonlightCommand: "moonlight",
      }
    })

    expect(launchedGameId).toBe("gba/wario-land-4")
    expect(result).toEqual({ status: "launched" })
  })

  it("returns a typed Moonlight failure when the desktop bridge prepared but could not stream", async () => {
    const result = await runLauncherWithResponse({
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

  it("returns typed local input failures from failed bridge responses", async () => {
    const result = await runLauncherWithResponse({
      status: "failed",
      category: "input-unavailable",
      message: "InputPlumber virtual gamepad not found",
    })

    expect(result).toEqual({
      status: "failed",
      exitCode: 123,
      stderrTail: "InputPlumber virtual gamepad not found",
      failureKind: "input-unavailable",
    })
  })

  it("returns typed server failure categories from failed bridge responses", async () => {
    const result = await runLauncherWithResponse({
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

  it("returns a deterministic launch failure for foreground session busy responses", async () => {
    const result = await runLauncherWithResponse({
      status: "failed",
      category: "session-busy",
      message: "Foreground session is not ready (Running)",
    })

    expect(result).toEqual({
      status: "failed",
      exitCode: 121,
      stderrTail: "Foreground session is not ready (Running)",
      failureKind: "session-busy",
    })
  })
})
