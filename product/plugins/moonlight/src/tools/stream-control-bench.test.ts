import { describe, expect, it } from "bun:test"
import { type ProviderId, pluginRecordId } from "@platform/plugin"
import type { MoonlightControlClient } from "../moonlight-control-client"
import type { GenericControlProvider } from "./stream-control-api-routes"
import {
  createStreamControlBenchApp,
  runStreamControlBenchCommand,
} from "./stream-control-bench"

const provider = "@example:presentation" as ProviderId

describe("stream control bench", () => {
  it("serves a touch-friendly disposable metadata-driven control panel", async () => {
    const app = createStreamControlBenchApp(
      { artifactDir: "/tmp/bench" },
      testDeps({ controlProviders: [providerDouble()] }),
    )

    const response = await app.fetch(new Request("http://bench.local/"))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain("stream control bench")
    expect(html).toContain("stream-control metadata")
    expect(html).toContain("cdn.tailwindcss.com")
    expect(html).toContain("type = 'range'")
  })

  it("applies Moonlight bitrate, FPS, and resolution controls and records diagnostics", async () => {
    const calls: unknown[] = []
    const logs: string[] = []
    const app = createStreamControlBenchApp(
      {
        artifactDir: "/tmp/bench",
        moonlightSocketPath: "/tmp/moonlight.sock",
      },
      testDeps({
        appendFile: async (_path, content) => {
          logs.push(content)
        },
        moonlight: moonlightClientDouble(calls),
        moonlightCalls: calls,
      }),
    )

    await postJson(app, "/api/moonlight/bitrate", { bitrateKbps: 6000 })
    await postJson(app, "/api/moonlight/fps", { fps: 30 })
    const resolution = await postJson(app, "/api/moonlight/resolution", {
      width: 1280,
      height: 720,
    })

    expect(resolution.status).toBe(200)
    expect(calls).toEqual([
      { socketPath: "/tmp/moonlight.sock" },
      { method: "setBitrate", params: { bitrateKbps: 6000 } },
      { method: "close" },
      { socketPath: "/tmp/moonlight.sock" },
      { method: "setFps", params: { fps: 30 } },
      { method: "close" },
      { socketPath: "/tmp/moonlight.sock" },
      { method: "setResolution", params: { width: 1280, height: 720 } },
      { method: "close" },
    ])
    const logText = logs.join("\n")
    expect(logText).toContain('"action":"moonlight.bitrate"')
    expect(logText).toContain('"action":"moonlight.fps"')
    expect(logText).toContain('"action":"moonlight.resolution"')
  })

  it("dispatches provider controls through the generic action endpoint", async () => {
    const calls: unknown[] = []
    const app = createStreamControlBenchApp(
      { artifactDir: "/tmp/bench" },
      testDeps({ controlProviders: [providerDouble(calls)] }),
    )
    const action = pluginRecordId(provider, "fps.set")

    const response = await postJson(app, "/api/action", {
      action,
      payload: { fps: 60 },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, action })
    expect(calls).toEqual([{ action, payload: { fps: 60 } }])
  })

  it("returns 400 for invalid mutation payloads", async () => {
    const app = createStreamControlBenchApp(
      { moonlightSocketPath: "/tmp/moonlight.sock" },
      testDeps({ moonlight: moonlightClientDouble([]) }),
    )

    const response = await postJson(app, "/api/moonlight/bitrate", {})
    const body = await response.json()
    const zeroResponse = await postJson(app, "/api/moonlight/bitrate", {
      bitrateKbps: 0,
    })
    const zeroBody = await zeroResponse.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({ ok: false })
    expect(body.error).toContain("bitrateKbps")
    expect(zeroResponse.status).toBe(400)
    expect(zeroBody).toMatchObject({ ok: false })
    expect(zeroBody.error).toContain("bitrateKbps")
  })

  it("returns 503 when a mutation target socket is disabled", async () => {
    const app = createStreamControlBenchApp({}, testDeps())

    const response = await postJson(app, "/api/moonlight/bitrate", {
      bitrateKbps: 6000,
    })
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.error).toContain("disabled")
  })

  it("validates run command arguments before serving", async () => {
    const errors: string[] = []
    const exitCode = await runStreamControlBenchCommand(["--port", "0"], {
      writeError: line => errors.push(line),
      serve: () => {
        throw new Error("serve should not be called")
      },
    })

    expect(exitCode).toBe(2)
    expect(errors.join("\n")).toContain("--port")
  })

  it("returns typed config and combined state without requiring providers", async () => {
    const app = createStreamControlBenchApp(
      {
        artifactDir: "/tmp/bench",
        moonlightSocketPath: "/tmp/moonlight.sock",
      },
      testDeps({ moonlight: moonlightClientDouble([]) }),
    )

    const configResponse = await app.fetch(
      new Request("http://bench.local/api/config"),
    )
    const config = await configResponse.json()
    const response = await app.fetch(
      new Request("http://bench.local/api/state"),
    )
    const body = await response.json()

    expect(config).toMatchObject({
      moonlight: { enabled: true },
      brightness: { enabled: false },
      battery: { enabled: false },
      plugins: {},
    })
    expect(response.status).toBe(200)
    expect(body.moonlight).toMatchObject({
      status: "ok",
      readback: {
        bitrate: 12_000,
        fps: 60,
        resolution: { width: 1920, height: 1080 },
      },
    })
    expect(body.plugins).toEqual({})
    expect(body.brightness.status).toBe("disabled")
    expect(body.battery.status).toBe("disabled")
  })
})

async function postJson(
  app: { fetch: (request: Request) => Promise<Response> | Response },
  path: string,
  body: unknown,
): Promise<Response> {
  return await app.fetch(
    new Request(`http://bench.local${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

function testDeps(
  overrides: Partial<{
    readonly appendFile: (path: string, content: string) => Promise<void>
    readonly moonlight: MoonlightControlClient
    readonly connectMoonlight: (
      socketPath: string,
    ) => Promise<MoonlightControlClient>
    readonly controlProviders: readonly GenericControlProvider[]
    readonly moonlightCalls: unknown[]
  }> = {},
) {
  return {
    now: () => new Date("2026-06-02T00:00:00.000Z"),
    mkdir: async () => undefined,
    appendFile: overrides.appendFile ?? (async () => undefined),
    controlProviders: overrides.controlProviders,
    connectMoonlight: async (socketPath: string) => {
      if (overrides.connectMoonlight) {
        return await overrides.connectMoonlight(socketPath)
      }
      if (!overrides.moonlight) throw new Error("moonlight unavailable")
      overrides.moonlightCalls?.push({ socketPath })
      return overrides.moonlight
    },
  }
}

function providerDouble(calls: unknown[] = []): GenericControlProvider {
  const action = pluginRecordId(provider, "fps.set")
  return {
    id: provider,
    enabled: true,
    controls: [
      {
        id: pluginRecordId(provider, "fps"),
        label: "Presentation FPS",
        subsystem: "presentation",
        provider,
        access: "read-write",
        status: "supported",
        unavailableReason: null,
        action,
        readback: pluginRecordId(provider, "fps"),
        value: { kind: "steps", values: [30, 60, 120] },
      },
    ],
    readState: async () => ({ status: "ok", readback: { fps: 60 } }),
    applyAction: async (nextAction, payload) => {
      calls.push({ action: nextAction, payload })
      return { result: { _tag: "command.result", status: "applied" } }
    },
  }
}

function moonlightClientDouble(calls: unknown[]): MoonlightControlClient {
  return {
    state: async () => ({
      result: {
        streamQuality: {
          bitrateKbps: 12_000,
          fps: 60,
          width: 1920,
          height: 1080,
        },
      },
    }),
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
