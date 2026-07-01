import { describe, expect, it } from "bun:test"
import { ValidationError } from "@platform/api/rpc/errors"
import { plugin, pluginRecordId } from "@platform/plugin"
import { createPluginRegistry } from "@platform/plugin/registry"
import type { MoonlightControlClient } from "@platform/stream/moonlight-control-client"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { Cause, Effect, Exit, Layer, Stream } from "effect"
import { handleGetStreamControlConfig } from "./get-config.rpc-handler"
import { handleGetStreamControlControls } from "./get-controls.rpc-handler"
import { handleGetStreamControlState } from "./get-state.rpc-handler"
import { unknownDeviceState } from "@platform/device/device-facts"
import { createStreamControlService, StreamControl } from "./service"
import { handleSetStreamControlAction } from "./set-action.rpc-handler"
import { handleSetBrightness } from "./set-brightness.rpc-handler"
import { handleSetMoonlightBitrate } from "./set-moonlight-bitrate.rpc-handler"

const providerOne = "@example:presentation" as const
const providerTwo = "@example:audio" as const

describe("app.stream-control RPC handlers", () => {
  it("registers generic and built-in stream-control RPC tags on the app group", () => {
    const tags = Array.from(appRpcGroup.requests.keys()).sort()

    expect(tags).toContain("app.stream-control.config.get")
    expect(tags).toContain("app.stream-control.controls.get")
    expect(tags).toContain("app.stream-control.state.get")
    expect(tags).toContain("app.stream-control.brightness.set")
    expect(tags).toContain("app.stream-control.moonlight-bitrate.set")
    expect(tags).toContain("app.stream-control.moonlight-fps.set")
    expect(tags).toContain("app.stream-control.moonlight-resolution.set")
    expect(tags).toContain("app.stream-control.action.set")
    expect(tags).not.toContain("app.stream-control.presentation-fps.set")
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

  it("rejects malformed built-in generic action payloads before device writes", async () => {
    const writes: unknown[] = []
    const files = new Map([
      ["/sys/class/backlight/panel-a/max_brightness", "255\n"],
      ["/sys/class/backlight/panel-a/brightness", "128\n"],
    ])

    const exit = await Effect.runPromiseExit(
      handleSetStreamControlAction({
        action: "app.stream-control.brightness.set",
        payload: { percent: null },
      }).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              {},
              {
                readdir: async () => ["panel-a"],
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

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(ValidationError)
    }
    expect(writes).toEqual([])
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

  it("reports product-accessible stream-control capabilities from fake providers", async () => {
    const controls = await Effect.runPromise(
      handleGetStreamControlControls({}).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              { moonlightSocketPath: "/run/moonlight.sock" },
              { pluginRegistry: fakeRegistry() },
            ),
          ),
        ),
      ),
    )

    expect(controls.controls).toContainEqual({
      id: pluginRecordId(providerOne, "fps"),
      label: "Presentation FPS",
      subsystem: "presentation",
      provider: providerOne,
      access: "read-write",
      status: "supported",
      unavailableReason: null,
      action: pluginRecordId(providerOne, "fps.set"),
      readback: pluginRecordId(providerOne, "fps"),
      value: { kind: "steps", values: [30, 60, 120] },
    })
    expect(controls.controls).toContainEqual({
      id: pluginRecordId(providerTwo, "volume"),
      label: "Volume",
      subsystem: "audio",
      provider: providerTwo,
      access: "read-write",
      status: "supported",
      unavailableReason: null,
      action: pluginRecordId(providerTwo, "volume.set"),
      readback: pluginRecordId(providerTwo, "volume"),
      value: { kind: "range", min: 0, max: 100, step: 5 },
    })
    expect(controls.controls).not.toContainEqual(
      expect.objectContaining({ id: "coordinated.fps" }),
    )
  })

  it("reports generic config and state data", async () => {
    const service = createStreamControlService(
      { moonlightSocketPath: "/run/moonlight.sock", artifactDir: "/tmp/evier" },
      {
        pluginRegistry: fakeRegistry(),
        readdir: async () => [],
        connectMoonlight: async () =>
          ({
            state: async () => ({ result: { streamQuality: {} } }),
            close: () => undefined,
          }) as unknown as MoonlightControlClient,
      },
    )

    const config = await Effect.runPromise(
      handleGetStreamControlConfig({}).pipe(
        Effect.provide(Layer.succeed(StreamControl, service)),
      ),
    )
    const state = await Effect.runPromise(
      handleGetStreamControlState({}).pipe(
        Effect.provide(Layer.succeed(StreamControl, service)),
      ),
    )

    expect(config).toMatchObject({
      moonlight: { enabled: true },
      brightness: { enabled: true },
      battery: { enabled: true },
      plugins: {
        [providerOne]: { enabled: true },
        [providerTwo]: { enabled: true },
      },
      artifactDir: "/tmp/evier",
    })
    expect(state.plugins[providerOne]).toEqual({
      status: "ok",
      readback: { fps: 60, filter: "soft" },
    })
  })

  it("uses DeviceState as the authoritative battery readback when provided", async () => {
    const service = createStreamControlService(
      {},
      {
        deviceState: {
          current: () =>
            Effect.succeed({
              observedAt: "2026-07-01T00:00:00.000Z",
              battery: {
                _tag: "Ready",
                percent: 91,
                status: "Charging",
                charging: true,
                observedAt: "2026-07-01T00:00:00.000Z",
                supplies: [
                  {
                    name: "BAT0",
                    type: "Battery",
                    status: "Charging",
                    capacity: 91,
                    online: null,
                    voltageNow: null,
                    currentNow: null,
                    powerNow: null,
                    modelName: null,
                  },
                ],
              },
            }),
          changes: Stream.empty,
          refresh: () =>
            Effect.succeed({
              accepted: true,
              fact: "battery",
              state: unknownDeviceState(),
            }),
        },
        readdir: async () => {
          throw new Error("stream-control must not read battery sysfs directly")
        },
      },
    )

    const state = await Effect.runPromise(
      handleGetStreamControlState({}).pipe(
        Effect.provide(Layer.succeed(StreamControl, service)),
      ),
    )

    expect(state.battery).toEqual({
      status: "ok",
      readback: {
        percent: 91,
        status: "Charging",
        supplies: [
          {
            name: "BAT0",
            type: "Battery",
            status: "Charging",
            capacity: 91,
            online: null,
            voltageNow: null,
            currentNow: null,
            powerNow: null,
            modelName: null,
          },
        ],
      },
    })
  })

  it("dispatches provider actions through generic action RPC", async () => {
    const calls: unknown[] = []
    const action = pluginRecordId(providerOne, "fps.set")

    const response = await Effect.runPromise(
      handleSetStreamControlAction({ action, payload: { fps: 120 } }).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService(
              {},
              { pluginRegistry: fakeRegistry(calls) },
            ),
          ),
        ),
      ),
    )

    expect(response).toMatchObject({
      action,
      requested: { fps: 120 },
      outcome: { kind: "single", status: "applied" },
    })
    expect(calls).toEqual([
      { provider: providerOne, action, payload: { fps: 120 } },
    ])
  })
})

function fakeRegistry(calls: unknown[] = []) {
  return createPluginRegistry(
    [fakePresentationPlugin(calls), fakeAudioPlugin()],
    {
      enabledPluginIds: [providerOne, providerTwo],
    },
  )
}

function fakePresentationPlugin(calls: unknown[]) {
  return plugin({
    namespace: "@example",
    name: "presentation",
    contributes: {
      handlers: [
        {
          id: "fake.presentation.describe",
          operation: "stream-control.describe",
          run: context => ({
            config: { enabled: true },
            controls: [
              {
                id: pluginRecordId(context.provider, "fps"),
                label: "Presentation FPS",
                subsystem: "presentation",
                provider: context.provider,
                access: "read-write",
                status: "supported",
                unavailableReason: null,
                action: pluginRecordId(context.provider, "fps.set"),
                readback: pluginRecordId(context.provider, "fps"),
                value: { kind: "steps", values: [30, 60, 120] },
              },
              {
                id: pluginRecordId(context.provider, "filter"),
                label: "Filter",
                subsystem: "presentation",
                provider: context.provider,
                access: "read-write",
                status: "supported",
                unavailableReason: null,
                action: pluginRecordId(context.provider, "filter.set"),
                readback: pluginRecordId(context.provider, "filter"),
                value: { kind: "options", values: ["soft", "crisp"] },
              },
            ],
            state: { status: "ok", readback: { fps: 60, filter: "soft" } },
          }),
        },
        {
          id: "fake.presentation.apply",
          operation: "stream-control.apply",
          run: context => {
            const input = context.input as {
              readonly action: string
              readonly payload: Record<string, unknown>
            }
            calls.push({
              provider: context.provider,
              action: input.action,
              payload: input.payload,
            })
            return { result: { _tag: "command.result", status: "applied" } }
          },
        },
      ],
    },
  })
}

function fakeAudioPlugin() {
  return plugin({
    namespace: "@example",
    name: "audio",
    contributes: {
      handlers: [
        {
          id: "fake.audio.describe",
          operation: "stream-control.describe",
          run: context => ({
            config: { enabled: true },
            controls: [
              {
                id: pluginRecordId(context.provider, "volume"),
                label: "Volume",
                subsystem: "audio",
                provider: context.provider,
                access: "read-write",
                status: "supported",
                unavailableReason: null,
                action: pluginRecordId(context.provider, "volume.set"),
                readback: pluginRecordId(context.provider, "volume"),
                value: { kind: "range", min: 0, max: 100, step: 5 },
              },
            ],
            state: { status: "ok", readback: { volume: 80 } },
          }),
        },
      ],
    },
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
