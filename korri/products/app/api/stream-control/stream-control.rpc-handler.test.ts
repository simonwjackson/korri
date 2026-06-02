import { describe, expect, it } from "bun:test"
import { appRpcGroup } from "@app/api/app-rpc-group"
import { ValidationError } from "@shared/api/rpc/errors"
import type { GamescopeControlClient } from "@shared/gamescope-control/gamescope-control-client"
import type { GamescopeControlCommandMethod } from "@shared/gamescope-control/gamescope-control-protocol"
import type { MoonlightControlClient } from "@shared/stream/moonlight-control-client"
import { Cause, Effect, Exit, Layer } from "effect"
import { handleGetStreamControlConfig } from "./get-config.rpc-handler"
import { handleGetStreamControlState } from "./get-state.rpc-handler"
import { createStreamControlService, StreamControl } from "./service"
import { handleSetGamescopeFps } from "./set-gamescope-fps.rpc-handler"
import { handleSetMoonlightBitrate } from "./set-moonlight-bitrate.rpc-handler"

describe("app.stream-control RPC handlers", () => {
  it("registers the Evier stream-control RPC tags on the app group", () => {
    const tags = Array.from(appRpcGroup.requests.keys()).sort()

    expect(tags).toContain("app.stream-control.config.get")
    expect(tags).toContain("app.stream-control.state.get")
    expect(tags).toContain("app.stream-control.moonlight-bitrate.set")
    expect(tags).toContain("app.stream-control.moonlight-fps.set")
    expect(tags).toContain("app.stream-control.moonlight-resolution.set")
    expect(tags).toContain("app.stream-control.gamescope-mode.set")
    expect(tags).toContain("app.stream-control.gamescope-fps.set")
    expect(tags).toContain("app.stream-control.gamescope-filter.set")
    expect(tags).toContain("app.stream-control.gamescope-sharpness.set")
  })

  it("applies Moonlight bitrate through the typed control service", async () => {
    const calls: unknown[] = []

    const response = await Effect.runPromise(
      handleSetMoonlightBitrate({ bitrateKbps: 12_000 }).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              { moonlightSocketPath: "/run/moonlight.sock" },
              {
                connectMoonlight: async socketPath =>
                  recordingMoonlightClient(calls, socketPath),
              },
            ),
          ),
        ),
      ),
    )

    expect(response).toMatchObject({
      action: "moonlight.bitrate",
      requested: { bitrateKbps: 12_000 },
    })
    expect(calls).toEqual([
      { socketPath: "/run/moonlight.sock" },
      { method: "setBitrate", params: { bitrateKbps: 12_000 } },
      { method: "close" },
    ])
  })

  it("rejects zero bitrate before touching Moonlight", async () => {
    const calls: unknown[] = []

    const exit = await Effect.runPromiseExit(
      handleSetMoonlightBitrate({ bitrateKbps: 0 }).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              { moonlightSocketPath: "/run/moonlight.sock" },
              {
                connectMoonlight: async socketPath =>
                  recordingMoonlightClient(calls, socketPath),
              },
            ),
          ),
        ),
      ),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(ValidationError)
    }
    expect(calls).toEqual([])
  })

  it("keeps Gamescope controls separate from Moonlight controls", async () => {
    const calls: unknown[] = []

    const response = await Effect.runPromise(
      handleSetGamescopeFps({ fps: 120 }).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              { gamescopeSocketPath: "/run/gamescope.sock" },
              {
                connectGamescope: async socketPath =>
                  recordingGamescopeClient(calls, socketPath),
              },
            ),
          ),
        ),
      ),
    )

    expect(response).toMatchObject({
      action: "gamescope.fps",
      requested: { fps: 120 },
    })
    expect(calls).toEqual([
      { socketPath: "/run/gamescope.sock" },
      { method: "requestCommand", command: "fps.set", params: { fps: 120 } },
      { method: "close" },
    ])
  })

  it("reports socket configuration through RPC config data", async () => {
    const config = await Effect.runPromise(
      handleGetStreamControlConfig({}).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService({
              moonlightSocketPath: "/run/moonlight.sock",
              gamescopeSocketPath: "/run/gamescope.sock",
              artifactDir: "/tmp/evier",
            }),
          ),
        ),
      ),
    )

    expect(config).toEqual({
      moonlight: { enabled: true },
      gamescope: { enabled: true },
      artifactDir: "/tmp/evier",
    })
  })

  it("reports disabled stream-control state through RPC data", async () => {
    const state = await Effect.runPromise(
      handleGetStreamControlState({}).pipe(
        Effect.provide(
          Layer.succeed(StreamControl, createStreamControlService({})),
        ),
      ),
    )

    expect(state).toEqual({
      moonlight: { status: "disabled" },
      gamescope: { status: "disabled" },
    })
  })

  it("reports live and failed socket state through RPC data", async () => {
    const state = await Effect.runPromise(
      handleGetStreamControlState({}).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              {
                moonlightSocketPath: "/run/moonlight.sock",
                gamescopeSocketPath: "/run/gamescope.sock",
              },
              {
                connectMoonlight: async () =>
                  ({
                    state: async () => ({ ok: true }),
                    close: () => undefined,
                  }) as unknown as MoonlightControlClient,
                connectGamescope: async () => {
                  throw new Error("gamescope offline")
                },
              },
            ),
          ),
        ),
      ),
    )

    expect(state).toEqual({
      moonlight: { status: "ok", response: { ok: true } },
      gamescope: { status: "error", error: "gamescope offline" },
    })
  })
})

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

function recordingMoonlightClient(
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

function recordingGamescopeClient(
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
