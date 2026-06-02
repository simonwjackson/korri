import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { GamescopeControlClient } from "@shared/gamescope-control/gamescope-control-client"
import type { GamescopeControlCommandMethod } from "@shared/gamescope-control/gamescope-control-protocol"
import type { MoonlightControlClient } from "@shared/stream/moonlight-control-client"
import {
  createStreamControlBenchApp,
  runStreamControlBenchCommand,
} from "./stream-control-bench"

describe("stream control bench", () => {
  it("serves a touch-friendly disposable control panel", async () => {
    const app = createStreamControlBenchApp(
      { artifactDir: "/tmp/bench" },
      fakeDeps(),
    )

    const response = await app.fetch(new Request("http://bench.local/"))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain("Moonlight stream")
    expect(html).toContain("Gamescope presentation")
    expect(html).toContain("cdn.tailwindcss.com")
    expect(html).toContain("DEBOUNCE_MS = 500")
    expect(html).toContain('type="range"')
    expect(html).toContain('type="radio"')
  })

  it("applies Moonlight bitrate, FPS, and resolution controls and records diagnostics", async () => {
    const calls: unknown[] = []
    const logs: string[] = []
    const app = createStreamControlBenchApp(
      {
        artifactDir: "/tmp/bench",
        moonlightSocketPath: "/tmp/moonlight.sock",
      },
      fakeDeps({
        appendFile: async (_path, content) => {
          logs.push(content)
        },
        moonlight: fakeMoonlightClient(calls),
        moonlightCalls: calls,
        sendMoonlightResolution: async (socketPath, params) => {
          calls.push({ socketPath })
          calls.push({ method: "setResolution", params })
          return commandAccepted("runtime.setResolution")
        },
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
    ])
    const logText = logs.join("\n")
    expect(logText).toContain('"action":"moonlight.bitrate"')
    expect(logText).toContain('"action":"moonlight.fps"')
    expect(logText).toContain('"action":"moonlight.resolution"')
  })

  it("returns 400 for invalid mutation payloads", async () => {
    const app = createStreamControlBenchApp(
      { moonlightSocketPath: "/tmp/moonlight.sock" },
      fakeDeps({ moonlight: fakeMoonlightClient([]) }),
    )

    const response = await postJson(app, "/api/moonlight/bitrate", {})
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain("bitrateKbps")
  })

  it("returns 503 when a mutation target socket is disabled", async () => {
    const app = createStreamControlBenchApp({}, fakeDeps())

    const response = await postJson(app, "/api/moonlight/bitrate", {
      bitrateKbps: 6000,
    })
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.error).toContain("disabled")
  })

  it("sends Moonlight resolution through a raw local-control socket", async () => {
    await withMoonlightSocket(async ({ socketPath, requests }) => {
      const app = createStreamControlBenchApp(
        { moonlightSocketPath: socketPath },
        fakeDeps(),
      )

      const response = await postJson(app, "/api/moonlight/resolution", {
        width: 1280,
        height: 720,
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(requests).toEqual([
        {
          jsonrpc: "2.0",
          id: expect.any(String),
          method: "runtime.setResolution",
          params: { width: 1280, height: 720 },
        },
      ])
    })
  })

  it("applies Gamescope mode/filter/sharpness controls and records diagnostics", async () => {
    const calls: unknown[] = []
    const logs: string[] = []
    const app = createStreamControlBenchApp(
      {
        artifactDir: "/tmp/bench",
        gamescopeSocketPath: "/tmp/gamescope.sock",
      },
      fakeDeps({
        appendFile: async (_path, content) => {
          logs.push(content)
        },
        gamescope: fakeGamescopeClient(calls),
        gamescopeCalls: calls,
      }),
    )

    await postJson(app, "/api/gamescope/mode", { width: 960, height: 540 })
    await postJson(app, "/api/gamescope/filter", { filter: "fsr" })
    await postJson(app, "/api/gamescope/sharpness", {
      sharpness: 0,
    })
    const fps = await postJson(app, "/api/gamescope/fps", { fps: 60 })

    expect(fps.status).toBe(200)
    expect(calls).toEqual([
      { socketPath: "/tmp/gamescope.sock" },
      { method: "setMode", params: { width: 960, height: 540 } },
      { method: "close" },
      { socketPath: "/tmp/gamescope.sock" },
      { method: "setFilter", params: { filter: "fsr" } },
      { method: "close" },
      { socketPath: "/tmp/gamescope.sock" },
      { method: "setSharpness", params: { sharpness: 0 } },
      { method: "close" },
      { socketPath: "/tmp/gamescope.sock" },
      { method: "requestCommand", command: "fps.set", params: { fps: 60 } },
      { method: "close" },
    ])
    const logText = logs.join("\n")
    expect(logText).toContain('"action":"gamescope.mode"')
    expect(logText).toContain('"action":"gamescope.filter"')
    expect(logText).toContain('"action":"gamescope.sharpness"')
    expect(logText).toContain('"action":"gamescope.fps"')
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

  it("returns combined state without requiring both sockets", async () => {
    const app = createStreamControlBenchApp(
      {
        artifactDir: "/tmp/bench",
        moonlightSocketPath: "/tmp/moonlight.sock",
      },
      fakeDeps({ moonlight: fakeMoonlightClient([]) }),
    )

    const response = await app.fetch(
      new Request("http://bench.local/api/state"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.moonlight.status).toBe("ok")
    expect(body.gamescope.status).toBe("disabled")
  })
})

async function withMoonlightSocket(
  run: (context: {
    readonly socketPath: string
    readonly requests: readonly Record<string, unknown>[]
  }) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "stream-control-bench-"))
  const socketPath = join(dir, "control.sock")
  const requests: Record<string, unknown>[] = []
  const server = createServer(socket => {
    let buffered = ""
    socket.on("data", chunk => {
      buffered += chunk.toString("utf8")
      while (buffered.includes("\n")) {
        const index = buffered.indexOf("\n")
        const line = buffered.slice(0, index)
        buffered = buffered.slice(index + 1)
        if (line.length === 0) continue
        const request = JSON.parse(line)
        requests.push(request)
        socket.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { _tag: "command.accepted", requestId: "request", command: request.method } })}\n`,
        )
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(socketPath, resolve)
  })

  try {
    await run({ socketPath, requests })
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
}

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

function fakeDeps(
  overrides: Partial<{
    readonly appendFile: (path: string, content: string) => Promise<void>
    readonly moonlight: MoonlightControlClient
    readonly gamescope: GamescopeControlClient
    readonly sendMoonlightResolution: (
      socketPath: string,
      params: { readonly width: number; readonly height: number },
    ) => Promise<unknown>
    readonly moonlightCalls: unknown[]
    readonly gamescopeCalls: unknown[]
  }> = {},
) {
  return {
    now: () => new Date("2026-06-02T00:00:00.000Z"),
    mkdir: async () => undefined,
    appendFile: overrides.appendFile ?? (async () => undefined),
    connectMoonlight: async (socketPath: string) => {
      overrides.moonlightCalls?.push?.({ socketPath })
      return overrides.moonlight ?? fakeMoonlightClient([])
    },
    ...(overrides.sendMoonlightResolution
      ? { sendMoonlightResolution: overrides.sendMoonlightResolution }
      : {}),
    connectGamescope: async (socketPath: string) => {
      overrides.gamescopeCalls?.push?.({ socketPath })
      return overrides.gamescope ?? fakeGamescopeClient([])
    },
  }
}

function fakeMoonlightClient(calls: unknown[]): MoonlightControlClient {
  return {
    hello: async () => ({
      jsonrpc: "2.0",
      id: "1",
      result: { _tag: "protocol.hello" } as never,
    }),
    state: async () => ({
      jsonrpc: "2.0",
      id: "2",
      result: {
        _tag: "state.snapshot",
        session: { state: "streaming" },
      } as never,
    }),
    subscribe: async () => ({
      jsonrpc: "2.0",
      id: "3",
      result: { _tag: "events.subscribed", seq: 1 } as never,
    }),
    setBitrate: async params => {
      calls.push({ method: "setBitrate", params })
      return commandAccepted("runtime.setBitrate")
    },
    setFps: async params => {
      calls.push({ method: "setFps", params })
      return commandAccepted("runtime.setFps")
    },
    onEvent: () => () => undefined,
    close: () => calls.push({ method: "close" }),
  }
}

function fakeGamescopeClient(calls: unknown[]): GamescopeControlClient {
  return {
    hello: async () => ({
      jsonrpc: "2.0",
      id: "1",
      result: { _tag: "protocol.hello" } as never,
    }),
    state: async () => ({
      jsonrpc: "2.0",
      id: "2",
      result: {
        _tag: "state.snapshot",
        xwaylandMode: { width: 1920, height: 1080 },
      } as never,
    }),
    subscribe: async () => ({
      jsonrpc: "2.0",
      id: "3",
      result: { _tag: "events.subscribed", seq: 1 } as never,
    }),
    unsubscribe: async () => ({
      jsonrpc: "2.0",
      id: "4",
      result: { _tag: "events.unsubscribed", seq: 2 } as never,
    }),
    setMode: async params => {
      calls.push({ method: "setMode", params })
      return gamescopeCommand("mode.set", params)
    },
    setFilter: async params => {
      calls.push({ method: "setFilter", params })
      return gamescopeCommand("filter.set", params)
    },
    setSharpness: async params => {
      calls.push({ method: "setSharpness", params })
      return gamescopeCommand("sharpness.set", params)
    },
    requestCommand: async (command, params) => {
      calls.push({ method: "requestCommand", command, params })
      return gamescopeCommand(command, params)
    },
    onEvent: () => () => undefined,
    close: () => calls.push({ method: "close" }),
  }
}

function commandAccepted(
  command: "runtime.setBitrate" | "runtime.setFps" | "runtime.setResolution",
) {
  return {
    jsonrpc: "2.0" as const,
    id: "cmd",
    result: {
      _tag: "command.accepted" as const,
      requestId: "request",
      command,
    },
  }
}

function gamescopeCommand(
  command: GamescopeControlCommandMethod,
  requested: unknown,
) {
  return {
    jsonrpc: "2.0" as const,
    id: "cmd",
    result: {
      _tag: "command.result" as const,
      command,
      status: "applied" as const,
      requested,
      applied: {},
    },
  }
}
