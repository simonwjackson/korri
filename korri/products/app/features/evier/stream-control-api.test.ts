import { describe, expect, it } from "bun:test"
import type { GamescopeControlClient } from "@shared/gamescope-control/gamescope-control-client"
import type { GamescopeControlCommandMethod } from "@shared/gamescope-control/gamescope-control-protocol"
import type { MoonlightControlClient } from "@shared/stream/moonlight-control-client"
import {
  createEvierStreamControlApi,
  evierStreamControlOptionsFromEnv,
} from "./stream-control-api"

describe("Evier stream control API", () => {
  it("loads socket and artifact configuration from the Electrobun app environment", () => {
    expect(
      evierStreamControlOptionsFromEnv({
        MOONLIGHT_LOCAL_CONTROL_SOCKET: "/run/moonlight.sock",
        KORRI_GAMESCOPE_CONTROL_SOCKET: "/run/gamescope.sock",
        KORRI_EVIER_ARTIFACT_DIR: "/tmp/evier-artifacts",
      }),
    ).toEqual({
      moonlightSocketPath: "/run/moonlight.sock",
      gamescopeSocketPath: "/run/gamescope.sock",
      artifactDir: "/tmp/evier-artifacts",
    })
  })

  it("applies Moonlight mutations through app-owned endpoints", async () => {
    const calls: unknown[] = []
    const app = createEvierStreamControlApi(
      { moonlightSocketPath: "/run/moonlight.sock" },
      {
        connectMoonlight: async socketPath =>
          fakeMoonlightClient(calls, socketPath),
      },
    )

    const response = await postJson(app, "/moonlight/bitrate", {
      bitrateKbps: 0,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      action: "moonlight.bitrate",
      requested: { bitrateKbps: 0 },
    })
    expect(calls).toEqual([
      { socketPath: "/run/moonlight.sock" },
      { method: "setBitrate", params: { bitrateKbps: 0 } },
      { method: "close" },
    ])
  })

  it("keeps Gamescope controls separate from Moonlight controls", async () => {
    const calls: unknown[] = []
    const app = createEvierStreamControlApi(
      { gamescopeSocketPath: "/run/gamescope.sock" },
      {
        connectGamescope: async socketPath =>
          fakeGamescopeClient(calls, socketPath),
      },
    )

    const response = await postJson(app, "/gamescope/fps", { fps: 120 })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      action: "gamescope.fps",
      requested: { fps: 120 },
    })
    expect(calls).toEqual([
      { socketPath: "/run/gamescope.sock" },
      { method: "requestCommand", command: "fps.set", params: { fps: 120 } },
      { method: "close" },
    ])
  })

  it("reports disabled sockets without requiring the CLI bench to be running", async () => {
    const app = createEvierStreamControlApi({})

    const state = await (await app.request("/state")).json()
    const mutation = await postJson(app, "/moonlight/fps", { fps: 60 })

    expect(state).toEqual({
      moonlight: { status: "disabled" },
      gamescope: { status: "disabled" },
    })
    expect(mutation.status).toBe(503)
    expect(await mutation.json()).toEqual({
      ok: false,
      error: "moonlight socket disabled",
    })
  })
})

function postJson(
  app: ReturnType<typeof createEvierStreamControlApi>,
  path: string,
  body: unknown,
) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function commandAccepted(command: string): Promise<never> {
  return Promise.resolve({
    jsonrpc: "2.0" as const,
    id: "test",
    result: {
      _tag: "command.accepted",
      requestId: "request",
      command,
      status: "applied",
      requested: {},
      applied: {},
    },
  } as never)
}

function fakeMoonlightClient(
  calls: unknown[],
  socketPath: string,
): MoonlightControlClient {
  calls.push({ socketPath })
  return {
    setBitrate: (params: { readonly bitrateKbps: number }) => {
      calls.push({ method: "setBitrate", params })
      return commandAccepted("runtime.setBitrate")
    },
    close: () => calls.push({ method: "close" }),
  } as unknown as MoonlightControlClient
}

function fakeGamescopeClient(
  calls: unknown[],
  socketPath: string,
): GamescopeControlClient {
  calls.push({ socketPath })
  return {
    requestCommand: (
      command: GamescopeControlCommandMethod,
      params?: unknown,
    ) => {
      calls.push({ method: "requestCommand", command, params })
      return commandAccepted(command)
    },
    close: () => calls.push({ method: "close" }),
  } as unknown as GamescopeControlClient
}
