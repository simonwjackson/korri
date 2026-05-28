/**
 * After the federation-v1 simplification, the bun-bridge path
 * (`LocalStreamLaunchClient` → `app.desktop.launch`) only handles
 * remote-source (Moonlight) launches. Local-source launches go
 * straight to `app.library.launch` over the standard RPC client, so
 * these tests pin source.isLocal=false on every call.
 */
import { describe, expect, it } from "bun:test"
import type { LocalStreamLaunchInput } from "@app/stream/local-stream-launch-client"
import type { LocalStreamLaunchResponse } from "@app/stream/local-stream-launch-rpc"
import { Launcher } from "@shared/library/library-services"
import { Effect } from "effect"
import { createLauncherLayerBridge } from "./launcher-layer-bridge"

const REMOTE_SOURCE = {
  hostId: "aka",
  controlUrl: "http://192.168.1.50:3001",
  isLocal: false as const,
}

async function runRemoteLauncherWithResponse(
  response: LocalStreamLaunchResponse,
) {
  return await runRemoteLauncherWithClient(async () => response)
}

async function runRemoteLauncherWithClient(
  launchGame: (
    input: LocalStreamLaunchInput,
  ) => Promise<LocalStreamLaunchResponse>,
) {
  return await Effect.runPromise(
    Effect.gen(function* () {
      const launcher = yield* Launcher
      return yield* launcher.run(
        { command: "gba/wario-land-4", args: [] },
        { source: REMOTE_SOURCE },
      )
    }).pipe(
      Effect.provide(createLauncherLayerBridge({ client: { launchGame } })),
    ),
  )
}

describe("LauncherLayerBridge (remote-source / Moonlight path)", () => {
  it("sends the selected game id and source through the typed desktop launch client", async () => {
    let launchedInput: LocalStreamLaunchInput | undefined

    const result = await runRemoteLauncherWithClient(async input => {
      launchedInput = input
      return {
        status: "launched",
        gameId: input.id,
        moonlightCommand: "moonlight",
      }
    })

    expect(launchedInput?.id).toBe("gba/wario-land-4")
    expect(launchedInput?.source).toEqual(REMOTE_SOURCE)
    expect(result).toEqual({ status: "launched" })
  })

  it("returns a typed Moonlight failure when the desktop bridge prepared but could not stream", async () => {
    const result = await runRemoteLauncherWithResponse({
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
    const result = await runRemoteLauncherWithResponse({
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
    const result = await runRemoteLauncherWithResponse({
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
    const result = await runRemoteLauncherWithResponse({
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
