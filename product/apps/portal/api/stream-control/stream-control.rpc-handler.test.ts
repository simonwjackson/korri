import { describe, expect, it } from "bun:test"
import { createServer, type Server } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ValidationError } from "@platform/api/rpc/errors"
import { unknownDeviceState } from "@platform/device/device-facts"
import { plugin, pluginRecordId } from "@platform/plugin"
import { createPluginRegistry } from "@platform/plugin/registry"
import { createActiveStreamControlSessionRegistry } from "@platform/stream/stream-session"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { moonlightPlugin } from "@product/plugins/moonlight"
import { Cause, Effect, Exit, Layer, Stream } from "effect"
import { handleGetStreamControlConfig } from "./get-config.rpc-handler"
import { handleGetStreamControlControls } from "./get-controls.rpc-handler"
import { handleGetStreamControlState } from "./get-state.rpc-handler"
import { createStreamControlService, StreamControl } from "./service"
import { handleSetStreamControlAction } from "./set-action.rpc-handler"
import { handleSetBrightness } from "./set-brightness.rpc-handler"

const providerOne = "@example:presentation" as const
const providerTwo = "@example:audio" as const

describe("app.stream-control RPC handlers", () => {
  it("registers generic and built-in stream-control RPC tags on the app group", () => {
    const tags = Array.from(appRpcGroup.requests.keys()).sort()

    expect(tags).toContain("app.stream-control.config.get")
    expect(tags).toContain("app.stream-control.controls.get")
    expect(tags).toContain("app.stream-control.state.get")
    expect(tags).toContain("app.stream-control.brightness.set")
    expect(tags).toContain("app.stream-control.action.set")
    // Moonlight controls flow through the generic action path; the dedicated
    // endpoints are retired.
    expect(tags).not.toContain("app.stream-control.moonlight-bitrate.set")
    expect(tags).not.toContain("app.stream-control.moonlight-fps.set")
    expect(tags).not.toContain("app.stream-control.moonlight-resolution.set")
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

  it("applies Moonlight bitrate through the generic action path and the real plugin", async () => {
    await withMoonlightControlServer(async ({ socketPath, requests }) => {
      process.env.MOONLIGHT_LOCAL_CONTROL_SOCKET = socketPath
      try {
        const response = await Effect.runPromise(
          handleSetStreamControlAction({
            action: "@korri:moonlight/bitrate.set",
            payload: { bitrateKbps: 12_000 },
          }).pipe(
            Effect.provide(
              Layer.succeed(
                StreamControl,
                createStreamControlService(
                  {},
                  { pluginRegistry: moonlightRegistry() },
                ),
              ),
            ),
          ),
        )

        expect(response).toMatchObject({
          action: "@korri:moonlight/bitrate.set",
          requested: { bitrateKbps: 12_000 },
          outcome: { kind: "single", status: "pending" },
        })
        expect(requests.map(request => request.method)).toEqual([
          "runtime.setBitrate",
        ])
      } finally {
        delete process.env.MOONLIGHT_LOCAL_CONTROL_SOCKET
      }
    })
  })

  it("reports active adaptive stream policy state", async () => {
    const registry = createActiveStreamControlSessionRegistry()
    registry.register({
      sessionId: "stream-1",
      socketPath: "/run/stream/control.sock",
      adaptiveControl: () => ({
        snapshot: () => ({
          enabled: true,
          boundaries: {
            levers: { bitrate: { ceiling: 12_000 } },
            outcomes: { maxLatencyMs: 50 },
            lean: 0,
          },
          lastEvent: { kind: "dormant", reason: "within-hysteresis" },
        }),
        setBoundaries: () => {},
        dryRun: () => ({ kind: "dormant", reason: "within-hysteresis" }),
      }),
    })
    const service = createStreamControlService(
      {},
      { activeStreamControlSessionRegistry: registry },
    )

    const state = await Effect.runPromise(service.state())

    expect(state.adaptive).toEqual({
      status: "ok",
      readback: {
        enabled: true,
        boundaries: {
          levers: { bitrate: { ceiling: 12_000 } },
          outcomes: { maxLatencyMs: 50 },
          lean: 0,
        },
        lastEvent: { kind: "dormant", reason: "within-hysteresis" },
      },
    })
  })

  it("applies active adaptive stream boundaries through the generic action path", async () => {
    let captured: unknown
    const registry = createActiveStreamControlSessionRegistry()
    registry.register({
      sessionId: "stream-1",
      socketPath: "/run/stream/control.sock",
      adaptiveControl: () => ({
        snapshot: () => ({ enabled: true }),
        setBoundaries: boundaries => {
          captured = boundaries
        },
        dryRun: () => ({ kind: "dormant", reason: "within-hysteresis" }),
      }),
    })
    const service = createStreamControlService(
      {},
      { activeStreamControlSessionRegistry: registry },
    )

    const response = await Effect.runPromise(
      service.applyAction({
        action: "app.stream-control.adaptive.set",
        payload: { args: ["bitrate=..12000", "lean=responsive"] },
      }),
    )

    expect(response).toMatchObject({
      action: "app.stream-control.adaptive.set",
      outcome: { kind: "single", status: "applied" },
    })
    expect(captured).toEqual({
      levers: { bitrate: { ceiling: 12_000 } },
      outcomes: {},
      lean: 0,
      auto: undefined,
    })
  })

  it("previews active adaptive stream boundaries without applying them", async () => {
    let applied = false
    let previewed: unknown
    const registry = createActiveStreamControlSessionRegistry()
    registry.register({
      sessionId: "stream-1",
      socketPath: "/run/stream/control.sock",
      adaptiveControl: () => ({
        snapshot: () => ({ enabled: true }),
        setBoundaries: () => {
          applied = true
        },
        dryRun: boundaries => {
          previewed = boundaries
          return { kind: "dormant", reason: "within-hysteresis" }
        },
      }),
    })
    const service = createStreamControlService(
      {},
      { activeStreamControlSessionRegistry: registry },
    )

    const response = await Effect.runPromise(
      service.applyAction({
        action: "app.stream-control.adaptive.dry-run",
        payload: { args: ["bitrate=..12000"] },
      }),
    )

    expect(applied).toBe(false)
    expect(previewed).toEqual({
      levers: { bitrate: { ceiling: 12_000 } },
      outcomes: {},
      lean: undefined,
      auto: undefined,
    })
    expect(response.response).toEqual({
      _tag: "adaptive.boundaries.dry-run",
      decision: { kind: "dormant", reason: "within-hysteresis" },
      boundaries: {
        levers: { bitrate: { ceiling: 12_000 } },
        outcomes: {},
        lean: undefined,
        auto: undefined,
      },
    })
  })

  it("uses the active stream session socket instead of stale env socket", async () => {
    await withMoonlightControlServer(async active => {
      const staleSocket = join(
        tmpdir(),
        `korri-stale-moonlight-control-${crypto.randomUUID()}.sock`,
      )
      process.env.MOONLIGHT_LOCAL_CONTROL_SOCKET = staleSocket
      try {
        const registry = createActiveStreamControlSessionRegistry()
        registry.register({
          sessionId: "stream-1",
          socketPath: active.socketPath,
        })
        const service = createStreamControlService(
          {},
          {
            pluginRegistry: moonlightRegistry(),
            activeStreamControlSessionRegistry: registry,
          },
        )

        await Effect.runPromise(
          service.applyAction({
            action: "@korri:moonlight/bitrate.set",
            payload: { bitrateKbps: 7_000 },
          }),
        )

        expect(active.requests.map(request => request.method)).toEqual([
          "runtime.setBitrate",
        ])
      } finally {
        delete process.env.MOONLIGHT_LOCAL_CONTROL_SOCKET
      }
    })
  })

  it("rejects zero bitrate in the plugin before touching the socket", async () => {
    await withMoonlightControlServer(async ({ socketPath, requests }) => {
      process.env.MOONLIGHT_LOCAL_CONTROL_SOCKET = socketPath
      try {
        const exit = await Effect.runPromiseExit(
          handleSetStreamControlAction({
            action: "@korri:moonlight/bitrate.set",
            payload: { bitrateKbps: 0 },
          }).pipe(
            Effect.provide(
              Layer.succeed(
                StreamControl,
                createStreamControlService(
                  {},
                  { pluginRegistry: moonlightRegistry() },
                ),
              ),
            ),
          ),
        )

        expect(Exit.isFailure(exit)).toBe(true)
        expect(requests).toEqual([])
      } finally {
        delete process.env.MOONLIGHT_LOCAL_CONTROL_SOCKET
      }
    })
  })

  it("reports product-accessible stream-control capabilities from fake providers", async () => {
    const controls = await Effect.runPromise(
      handleGetStreamControlControls({}).pipe(
        Effect.provide(
          Layer.succeed(
            StreamControl,
            createStreamControlService({}, { pluginRegistry: fakeRegistry() }),
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
      { artifactDir: "/tmp/evier" },
      {
        pluginRegistry: fakeRegistry(),
        readdir: async () => [],
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

function moonlightRegistry() {
  return createPluginRegistry([moonlightPlugin], {
    enabledPluginIds: [moonlightPlugin.id],
  })
}

interface ControlServerRequest {
  readonly id: unknown
  readonly method: string
  readonly params?: unknown
}

/**
 * Minimal real Moonlight local-control server on a unix socket: accepts
 * newline-framed JSON-RPC and answers every request with command.accepted.
 */
async function withMoonlightControlServer(
  run: (harness: {
    readonly socketPath: string
    readonly requests: ControlServerRequest[]
  }) => Promise<void>,
): Promise<void> {
  const socketPath = join(
    tmpdir(),
    `korri-moonlight-control-${crypto.randomUUID()}.sock`,
  )
  const requests: ControlServerRequest[] = []
  const server: Server = createServer(socket => {
    let pending = ""
    socket.on("data", chunk => {
      pending += chunk.toString("utf8")
      while (pending.includes("\n")) {
        const index = pending.indexOf("\n")
        const line = pending.slice(0, index)
        pending = pending.slice(index + 1)
        if (line === "") continue
        const request = JSON.parse(line) as ControlServerRequest
        requests.push(request)
        socket.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              _tag: "command.accepted",
              requestId: request.id,
              command: request.method,
            },
          })}\n`,
        )
      }
    })
  })
  await new Promise<void>(resolve => server.listen(socketPath, resolve))
  try {
    await run({ socketPath, requests })
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
