import { describe, expect, it } from "bun:test"
import { ValidationError } from "@platform/api/rpc/errors"
import type { MoonlightControlClient } from "@platform/stream/moonlight-control-client"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import type {
  GamescopeControlClient,
  GamescopeControlCommandMethod,
} from "@product/plugins/gamescope/runtime-control"
import { Cause, Effect, Exit, Layer } from "effect"
import { handleGetStreamControlConfig } from "./get-config.rpc-handler"
import { handleGetStreamControlControls } from "./get-controls.rpc-handler"
import { handleGetStreamControlState } from "./get-state.rpc-handler"
import { createStreamControlService, StreamControl } from "./service"
import { handleSetBrightness } from "./set-brightness.rpc-handler"
import { handleSetGamescopeFps } from "./set-gamescope-fps.rpc-handler"
import { handleSetLinkedFps } from "./set-linked-fps.rpc-handler"
import { handleSetLinkedResolution } from "./set-linked-resolution.rpc-handler"
import { handleSetMoonlightBitrate } from "./set-moonlight-bitrate.rpc-handler"

describe("app.stream-control RPC handlers", () => {
  it("registers the Evier stream-control RPC tags on the app group", () => {
    const tags = Array.from(appRpcGroup.requests.keys()).sort()

    expect(tags).toContain("app.stream-control.config.get")
    expect(tags).toContain("app.stream-control.controls.get")
    expect(tags).toContain("app.stream-control.state.get")
    expect(tags).toContain("app.stream-control.brightness.set")
    expect(tags).toContain("app.stream-control.moonlight-bitrate.set")
    expect(tags).toContain("app.stream-control.moonlight-fps.set")
    expect(tags).toContain("app.stream-control.moonlight-resolution.set")
    expect(tags).toContain("app.stream-control.gamescope-mode.set")
    expect(tags).toContain("app.stream-control.gamescope-fps.set")
    expect(tags).toContain("app.stream-control.gamescope-filter.set")
    expect(tags).toContain("app.stream-control.gamescope-sharpness.set")
    expect(tags).toContain("app.stream-control.linked-fps.set")
    expect(tags).toContain("app.stream-control.linked-resolution.set")
  })

  it("applies brightness to every backlight device by percent", async () => {
    const writes: unknown[] = []
    const files = new Map([
      ["/sys/class/backlight/panel-a/max_brightness", "255\n"],
      ["/sys/class/backlight/panel-a/brightness", "128\n"],
      ["/sys/class/backlight/panel-b/max_brightness", "4096\n"],
      ["/sys/class/backlight/panel-b/brightness", "2048\n"],
    ])

    const response = await Effect.runPromise(
      handleSetBrightness({ percent: 50 }).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              {},
              {
                readdir: async () => ["panel-a", "panel-b"],
                readFile: async path => files.get(path) ?? "0\n",
                writeFile: async (path, content) => {
                  writes.push({ path, content })
                  files.set(path, content)
                },
              },
            ),
          ),
        ),
      ),
    )

    expect(response).toMatchObject({
      action: "brightness",
      requested: { percent: 50 },
      outcome: { kind: "single", status: "applied" },
      response: { requestedPercent: 50, percent: 50 },
    })
    expect(writes).toEqual([
      { path: "/sys/class/backlight/panel-a/brightness", content: "128\n" },
      { path: "/sys/class/backlight/panel-b/brightness", content: "2048\n" },
    ])
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
      outcome: { kind: "single", status: "pending" },
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
      outcome: { kind: "single", status: "pending" },
    })
    expect(calls).toEqual([
      { socketPath: "/run/gamescope.sock" },
      { method: "requestCommand", command: "fps.set", params: { fps: 120 } },
      { method: "close" },
    ])
  })

  it("reports product-accessible stream-control capabilities", async () => {
    const controls = await Effect.runPromise(
      handleGetStreamControlControls({}).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService({
              moonlightSocketPath: "/run/moonlight.sock",
              gamescopeSocketPath: "/run/gamescope.sock",
            }),
          ),
        ),
      ),
    )

    expect(controls.controls).toContainEqual({
      id: "linked.fps",
      subsystem: "linked",
      access: "read-write",
      status: "supported",
      unavailableReason: null,
      action: "app.stream-control.linked-fps.set",
      readback: "linked.fps",
      value: { kind: "steps", values: [30, 45, 60, 75, 90, 120] },
    })
    expect(controls.controls).toContainEqual({
      id: "gamescope.fps",
      subsystem: "gamescope",
      access: "read-write",
      status: "supported",
      unavailableReason: null,
      action: "app.stream-control.gamescope-fps.set",
      readback: "gamescope.fps",
      value: {
        kind: "steps",
        values: [0, 30, 45, 60, 75, 90, 120, 144, 165, 240],
      },
    })
    expect(controls.controls).toContainEqual({
      id: "battery.percent",
      subsystem: "battery",
      access: "read-only",
      status: "supported",
      unavailableReason: null,
      action: null,
      readback: "battery.percent",
      value: { kind: "read-only" },
    })
  })

  it("reports linked controls as unsupported when a required subsystem is disabled", async () => {
    const controls = await Effect.runPromise(
      handleGetStreamControlControls({}).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService({
              moonlightSocketPath: "/run/moonlight.sock",
            }),
          ),
        ),
      ),
    )

    expect(controls.controls).toContainEqual(
      expect.objectContaining({
        id: "linked.resolution",
        status: "unsupported",
        unavailableReason: "gamescope disabled",
      }),
    )
    expect(controls.controls).toContainEqual(
      expect.objectContaining({
        id: "gamescope.fps",
        status: "unsupported",
        unavailableReason: "gamescope disabled",
      }),
    )

    const withoutMoonlight = await Effect.runPromise(
      handleGetStreamControlControls({}).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService({
              gamescopeSocketPath: "/run/gamescope.sock",
            }),
          ),
        ),
      ),
    )

    expect(withoutMoonlight.controls).toContainEqual(
      expect.objectContaining({
        id: "linked.fps",
        status: "unsupported",
        unavailableReason: "moonlight disabled",
      }),
    )
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
      brightness: { enabled: true },
      battery: { enabled: true },
      artifactDir: "/tmp/evier",
    })
  })

  it("reports disabled stream-control state through RPC data", async () => {
    const state = await Effect.runPromise(
      handleGetStreamControlState({}).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService({}, { readdir: async () => [] }),
          ),
        ),
      ),
    )

    expect(state).toEqual({
      moonlight: { status: "disabled" },
      gamescope: { status: "disabled" },
      brightness: {
        status: "error",
        error: "no backlight devices in /sys/class/backlight",
      },
      battery: {
        status: "error",
        error: "no power supplies in /sys/class/power_supply",
      },
    })
  })

  it("reports typed live and failed socket state through RPC data", async () => {
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
                readdir: async () => [],
                connectMoonlight: async () =>
                  ({
                    state: async () => ({
                      result: {
                        streamQuality: {
                          bitrateKbps: 12_000,
                          fps: 60,
                          width: 1920,
                          height: 1080,
                        },
                        runtimeSettings: {
                          appliedBitrateKbps: 10_000,
                          appliedFps: 45,
                          appliedResolution: { width: 1280, height: 720 },
                        },
                      },
                    }),
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
      moonlight: {
        status: "ok",
        readback: {
          bitrateKbps: 10_000,
          fps: 45,
          resolution: { width: 1280, height: 720 },
        },
      },
      gamescope: { status: "error", error: "gamescope offline" },
      brightness: {
        status: "error",
        error: "no backlight devices in /sys/class/backlight",
      },
      battery: {
        status: "error",
        error: "no power supplies in /sys/class/power_supply",
      },
    })
  })

  it("orchestrates linked FPS through the service instead of the React page", async () => {
    const calls: unknown[] = []

    const response = await Effect.runPromise(
      handleSetLinkedFps({ fps: 60 }).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              {
                moonlightSocketPath: "/run/moonlight.sock",
                gamescopeSocketPath: "/run/gamescope.sock",
              },
              {
                connectMoonlight: async socketPath =>
                  recordingMoonlightClient(calls, socketPath),
                connectGamescope: async socketPath =>
                  recordingGamescopeClient(calls, socketPath),
              },
            ),
          ),
        ),
      ),
    )

    expect(response).toMatchObject({
      action: "linked.fps",
      requested: { fps: 60 },
      outcome: {
        kind: "linked",
        status: "pending",
        moonlight: { status: "pending" },
        gamescope: { status: "pending" },
      },
      response: { status: "pending" },
    })
    expect(calls).toEqual([
      { socketPath: "/run/moonlight.sock" },
      { method: "setFps", params: { fps: 60 } },
      { method: "close" },
      { socketPath: "/run/gamescope.sock" },
      { method: "requestCommand", command: "fps.set", params: { fps: 60 } },
      { method: "close" },
    ])
  })

  it("reports failed single-command outcomes when readback-backed commands fail", async () => {
    const calls: unknown[] = []

    const response = await Effect.runPromise(
      handleSetGamescopeFps({ fps: 60 }).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              { gamescopeSocketPath: "/run/gamescope.sock" },
              {
                connectGamescope: async socketPath => {
                  calls.push({ socketPath })
                  return {
                    requestCommand: (
                      command: GamescopeControlCommandMethod,
                      params?: unknown,
                    ) => {
                      calls.push({ method: "requestCommand", command, params })
                      return commandResult(
                        command,
                        "readback-mismatch",
                        "atom stayed at 60",
                      )
                    },
                    close: () => calls.push({ method: "close" }),
                  } as unknown as GamescopeControlClient
                },
              },
            ),
          ),
        ),
      ),
    )

    expect(response).toMatchObject({
      action: "gamescope.fps",
      requested: { fps: 60 },
      outcome: {
        kind: "single",
        status: "failed",
        error: "readback-mismatch: atom stayed at 60",
      },
    })
  })

  it("reports partial linked FPS outcomes when Gamescope readback fails", async () => {
    const calls: unknown[] = []

    const response = await Effect.runPromise(
      handleSetLinkedFps({ fps: 60 }).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              {
                moonlightSocketPath: "/run/moonlight.sock",
                gamescopeSocketPath: "/run/gamescope.sock",
              },
              {
                connectMoonlight: async socketPath =>
                  recordingMoonlightClient(calls, socketPath),
                connectGamescope: async socketPath => {
                  calls.push({ socketPath })
                  return {
                    requestCommand: (
                      command: GamescopeControlCommandMethod,
                      params?: unknown,
                    ) => {
                      calls.push({ method: "requestCommand", command, params })
                      return commandResult(
                        command,
                        "readback-mismatch",
                        "atom stayed at 30",
                      )
                    },
                    close: () => calls.push({ method: "close" }),
                  } as unknown as GamescopeControlClient
                },
              },
            ),
          ),
        ),
      ),
    )

    expect(response).toMatchObject({
      action: "linked.fps",
      requested: { fps: 60 },
      outcome: {
        kind: "linked",
        status: "partial",
        moonlight: { status: "pending" },
        gamescope: {
          status: "failed",
          error: "readback-mismatch: atom stayed at 30",
        },
      },
      response: {
        status: "partial",
        moonlight: { status: "pending" },
        gamescope: {
          status: "failed",
          error: "readback-mismatch: atom stayed at 30",
        },
      },
    })
  })

  it("reports partial linked resolution outcomes when one subsystem fails", async () => {
    const calls: unknown[] = []

    const response = await Effect.runPromise(
      handleSetLinkedResolution({ width: 1280, height: 720 }).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              {
                moonlightSocketPath: "/run/moonlight.sock",
                gamescopeSocketPath: "/run/gamescope.sock",
              },
              {
                connectMoonlight: async socketPath =>
                  recordingMoonlightClient(calls, socketPath),
                connectGamescope: async () => {
                  throw new Error("gamescope offline")
                },
              },
            ),
          ),
        ),
      ),
    )

    expect(response).toMatchObject({
      action: "linked.resolution",
      requested: { width: 1280, height: 720 },
      outcome: {
        kind: "linked",
        status: "partial",
        gamescope: { status: "failed", error: "gamescope offline" },
        moonlight: { status: "pending" },
      },
      response: {
        status: "partial",
        gamescope: { status: "failed", error: "gamescope offline" },
        moonlight: { status: "pending" },
      },
    })
  })
})

function commandResult(
  command: string,
  status: string,
  reason?: string,
): Promise<never> {
  return Promise.resolve({
    jsonrpc: "2.0" as const,
    id: "test",
    result: {
      _tag: "command.result",
      requestId: "request",
      command,
      status,
      requested: {},
      applied: {},
      ...(reason ? { reason } : {}),
    },
  } as never)
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
    setFps: (params: { readonly fps: number }) => {
      calls.push({ method: "setFps", params })
      return commandAccepted("runtime.setFps")
    },
    setResolution: (params: {
      readonly width: number
      readonly height: number
    }) => {
      calls.push({ method: "setResolution", params })
      return commandAccepted("runtime.setResolution")
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
    setMode: (params: { readonly width: number; readonly height: number }) => {
      calls.push({ method: "setMode", params })
      return commandAccepted("mode.set")
    },
    close: () => calls.push({ method: "close" }),
  } as unknown as GamescopeControlClient
}
