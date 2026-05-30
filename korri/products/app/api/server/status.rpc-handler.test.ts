import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import {
  handleServerStatus,
  handleServerStatusWithOverrides,
} from "./status.rpc-handler"

const originalEnv = {
  statusPath: process.env.KORRI_GAME_STREAM_STATUS_PATH,
  streamControl: process.env.KORRI_STREAM_CONTROL_ENABLED,
  runtimeDir: process.env.XDG_RUNTIME_DIR,
  serverId: process.env.KORRI_SERVER_ID,
  serverName: process.env.KORRI_SERVER_NAME,
  sessiondUrl: process.env.KORRI_SESSIOND_URL,
  sessiondToken: process.env.KORRI_SESSIOND_TOKEN,
  sessiondTokenFile: process.env.KORRI_SESSIOND_TOKEN_FILE,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  setOptionalEnv("KORRI_GAME_STREAM_STATUS_PATH", originalEnv.statusPath)
  setOptionalEnv("KORRI_STREAM_CONTROL_ENABLED", originalEnv.streamControl)
  setOptionalEnv("XDG_RUNTIME_DIR", originalEnv.runtimeDir)
  setOptionalEnv("KORRI_SERVER_ID", originalEnv.serverId)
  setOptionalEnv("KORRI_SERVER_NAME", originalEnv.serverName)
  setOptionalEnv("KORRI_SESSIOND_URL", originalEnv.sessiondUrl)
  setOptionalEnv("KORRI_SESSIOND_TOKEN", originalEnv.sessiondToken)
  setOptionalEnv("KORRI_SESSIOND_TOKEN_FILE", originalEnv.sessiondTokenFile)
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("app.server.status handler", () => {
  it("reports server identity, capabilities, and fresh runner status", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SERVER_ID = "aka"
    process.env.KORRI_SERVER_NAME = "Korri Stream on aka"

    const result = await Effect.runPromise(handleServerStatus({}))

    expect(result).toMatchObject({
      serverId: "aka",
      displayName: "Korri Stream on aka",
      protocolVersion: "1",
      capabilities: ["source", "stream"],
      status: "available",
      streamControl: "enabled",
      catalog: "available",
      runner: { mode: "running", stale: false },
    })
    expect(result.runner?.observedAt).toBeString()
  })

  it("keeps disabled stream control observable", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "0"

    const result = await Effect.runPromise(handleServerStatus({}))

    expect(result).toMatchObject({
      status: "stream-unavailable",
      streamControl: "disabled",
      catalog: "unavailable",
      message: "Korri stream control is not enabled",
    })
  })

  it("marks stale runner status as stale", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    const stale = new Date(Date.now() - 20 * 60 * 1000)
    await utimes(statusPath, stale, stale)
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"

    const result = await Effect.runPromise(handleServerStatus({}))

    expect(result.runner).toMatchObject({ mode: "running", stale: true })
  })

  it("merges sessiond /managed-launch/status into the response when sessiond is configured", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_URL = "http://127.0.0.1:3003"
    process.env.KORRI_SESSIOND_TOKEN = "test-token"
    const requests: Array<{
      readonly input: string
      readonly init?: RequestInit
    }> = []
    const fetchImpl = async (input: string, init?: RequestInit) => {
      requests.push({ input, init })
      return Response.json({
        schemaVersion: 1,
        mode: "idle",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
        },
        active: { launchId: "launch-7", mode: "idle" },
        restoreAttempts: 0,
      })
    }

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    expect(result.sessiond).toEqual({
      mode: "idle",
      active: { launchId: "launch-7", mode: "idle" },
      restoreAttempts: 0,
    })
    expect(result.sessiondUnavailable).toBeUndefined()
    expect(requests[0].input).toBe(
      "http://127.0.0.1:3003/managed-launch/status",
    )
    expect(
      (requests[0].init?.headers as Record<string, string>)[
        "x-korri-sessiond-token"
      ],
    ).toBe("test-token")
  })

  // Phase 4D / Track A finishing follow-up. The sessiond proxy must
  // forward the optional active.phase sub-phase so operator tooling
  // can distinguish launcher-running / wait-monitor / anchored
  // launches without reading the on-disk sidecar.

  it("forwards active.phase from sessiond into the status response", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_URL = "http://127.0.0.1:3003"
    process.env.KORRI_SESSIOND_TOKEN = "test-token"
    const fetchImpl = async () =>
      Response.json({
        schemaVersion: 1,
        mode: "game",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
          sessionLifecycle: true,
        },
        active: {
          launchId: "launch-anchor",
          mode: "game",
          phase: "anchored",
        },
        restoreAttempts: 0,
      })

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    expect(result.sessiond?.active).toEqual({
      launchId: "launch-anchor",
      mode: "game",
      phase: "anchored",
    })
  })

  it("forwards active without phase when sessiond does not surface one (Phase 4B back-compat)", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_URL = "http://127.0.0.1:3003"
    process.env.KORRI_SESSIOND_TOKEN = "test-token"
    const fetchImpl = async () =>
      Response.json({
        schemaVersion: 1,
        mode: "idle",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
        },
        active: { launchId: "launch-old", mode: "idle" },
        restoreAttempts: 0,
      })

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    expect(result.sessiond?.active).toEqual({
      launchId: "launch-old",
      mode: "idle",
    })
  })

  it("falls back to status.json with sessiondUnavailable=true when sessiond is unreachable", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_URL = "http://127.0.0.1:3003"
    process.env.KORRI_SESSIOND_TOKEN = "test-token"
    const fetchImpl = async () => {
      throw new Error("connection refused")
    }

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    expect(result.runner).toMatchObject({ mode: "running" })
    expect(result.sessiond).toBeUndefined()
    expect(result.sessiondUnavailable).toBe(true)
  })

  it("falls back to status.json with sessiondUnavailable=true when sessiond returns a malformed payload", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_URL = "http://127.0.0.1:3003"
    process.env.KORRI_SESSIOND_TOKEN = "test-token"
    const fetchImpl = async () =>
      Response.json({ status: "not-a-sessiond-status" })

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    expect(result.sessiond).toBeUndefined()
    expect(result.sessiondUnavailable).toBe(true)
  })

  it("sets sessiondUnavailable=true when sessiond returns HTTP 401 (token rejected)", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_URL = "http://127.0.0.1:3003"
    process.env.KORRI_SESSIOND_TOKEN = "test-token"
    const fetchImpl = async () => new Response("unauthorized", { status: 401 })

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    // 401 surfaces externally as `sessiondUnavailable: true` so existing
    // monitoring signal is preserved. The launch-path preflight uses the
    // distinct `token-rejected` probe kind to preserve the 401 →
    // `host-control-disabled` / exit-126 mapping for callers.
    expect(result.sessiond).toBeUndefined()
    expect(result.sessiondUnavailable).toBe(true)
  })

  it("does not set sessiondUnavailable when sessiond is not configured", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    delete process.env.KORRI_SESSIOND_URL

    const result = await Effect.runPromise(handleServerStatus({}))

    expect(result.sessiond).toBeUndefined()
    expect(result.sessiondUnavailable).toBeUndefined()
    expect(result.runner).toMatchObject({ mode: "running" })
  })
})

async function writeRunnerStatus(input: { readonly mode: string }) {
  const dir = await mkdtemp(join(tmpdir(), "korri-server-status-"))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const statusPath = join(dir, "status.json")
  await writeFile(statusPath, `${JSON.stringify(input)}\n`, { mode: 0o600 })
  return statusPath
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
