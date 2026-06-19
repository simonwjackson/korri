import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  installSteamLogObserverStatus,
  resetSteamLogObserverStatusForTests,
} from "@product/plugins/steam/src/observability/log-observer"
import { Effect } from "effect"
import {
  handleServerStatus,
  handleServerStatusWithOverrides,
  redactSessiondFailureReason,
} from "./status.rpc-handler"

const originalEnv = {
  statusPath: process.env.KORRI_GAME_STREAM_STATUS_PATH,
  streamControl: process.env.KORRI_STREAM_CONTROL_ENABLED,
  runtimeDir: process.env.XDG_RUNTIME_DIR,
  serverId: process.env.KORRI_DAEMON_ID,
  serverName: process.env.KORRI_DAEMON_NAME,
  sessiondSocket: process.env.KORRI_SESSIOND_SOCKET,
  enabledPlugins: process.env.KORRI_ENABLED_PLUGINS,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  setOptionalEnv("KORRI_GAME_STREAM_STATUS_PATH", originalEnv.statusPath)
  setOptionalEnv("KORRI_STREAM_CONTROL_ENABLED", originalEnv.streamControl)
  setOptionalEnv("XDG_RUNTIME_DIR", originalEnv.runtimeDir)
  setOptionalEnv("KORRI_DAEMON_ID", originalEnv.serverId)
  setOptionalEnv("KORRI_DAEMON_NAME", originalEnv.serverName)
  setOptionalEnv("KORRI_SESSIOND_SOCKET", originalEnv.sessiondSocket)
  setOptionalEnv("KORRI_ENABLED_PLUGINS", originalEnv.enabledPlugins)
  resetSteamLogObserverStatusForTests()
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
    process.env.KORRI_DAEMON_ID = "aka"
    process.env.KORRI_DAEMON_NAME = "Korri Stream on aka"

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
    process.env.KORRI_SESSIOND_SOCKET = "/run/user/1000/korri/sessiond.sock"
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
      "http://korri-sessiond/managed-launch/status",
    )
    expect((requests[0].init as RequestInit & { unix?: string }).unix).toBe(
      "/run/user/1000/korri/sessiond.sock",
    )
  })

  // Phase 4D / Track A finishing follow-up. The sessiond proxy must
  // forward the optional active.phase sub-phase so operator tooling
  // can distinguish launcher-running / wait-monitor / anchored
  // launches without reading the on-disk sidecar.

  it("forwards active.phase from sessiond into the status response", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_SOCKET = "/run/user/1000/korri/sessiond.sock"
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
    process.env.KORRI_SESSIOND_SOCKET = "/run/user/1000/korri/sessiond.sock"
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

  it("adds compact provider lifecycle summary from enabled plugins", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_ENABLED_PLUGINS = "@korri:steam"
    const owner = Symbol("server-status-lifecycle")
    installSteamLogObserverStatus(owner, () => ({
      health: {
        state: "running",
        watchedFiles: ["console_log.txt"],
        activeFiles: ["console_log.txt"],
        missingFiles: [],
      },
      recentEvidence: [],
      lifecycleEvents: [],
      lifecycleSummary: {
        providerId: "@korri:steam",
        observerHealth: "running",
        lifecycleStatus: "active",
        providerPhase: "shader-preparing",
        displayMessage:
          "Steam is checking shader cache metadata at /home/korri/secret.",
        confidence: "hint",
        nextActionHint: "wait",
        appId: "1029210",
        launchId: "launch-30xx",
      },
    }))

    const result = await Effect.runPromise(handleServerStatus({}))

    expect(result.providerLifecycle).toMatchObject({
      providerId: "@korri:steam",
      lifecycleStatus: "active",
      providerPhase: "shader-preparing",
      appId: "1029210",
      launchId: "launch-30xx",
    })
    expect(result.providerLifecycle?.displayMessage).not.toContain("/home/")
  })

  it("falls back to status.json with sessiondUnavailable=true when sessiond is unreachable", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_SOCKET = "/run/user/1000/korri/sessiond.sock"
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
    process.env.KORRI_SESSIOND_SOCKET = "/run/user/1000/korri/sessiond.sock"
    const fetchImpl = async () =>
      Response.json({ status: "not-a-sessiond-status" })

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    expect(result.sessiond).toBeUndefined()
    expect(result.sessiondUnavailable).toBe(true)
  })

  it("sets sessiondUnavailable=true when sessiond rejects the status request", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_SOCKET = "/run/user/1000/korri/sessiond.sock"
    const fetchImpl = async () => new Response("unauthorized", { status: 401 })

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    // 401 surfaces externally as `sessiondUnavailable: true` so existing
    // monitoring signal is preserved. The launch-path preflight uses the
    // distinct `request-rejected` probe kind to preserve the 401 →
    // `host-control-disabled` / exit-126 mapping for callers.
    expect(result.sessiond).toBeUndefined()
    expect(result.sessiondUnavailable).toBe(true)
  })

  // SEC-003 (task-036). \`SessiondLifecycleSummary.failureReason\` is
  // forwarded onto the unauthenticated-on-LAN \`app.server.status\` wire,
  // so the handler is the bounding seam for the string. Three guards:
  // (1) absolute-path-shaped substrings are replaced with \`<path>\`;
  // (2) length is clamped to 256 chars with a trailing ellipsis;
  // (3) short, path-free strings pass through unchanged so operator
  // diagnostics keep their value.
  it("redacts absolute-path-shaped substrings from sessiond.failureReason (SEC-003)", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_SOCKET = "/run/user/1000/korri/sessiond.sock"
    const fetchImpl = async () =>
      Response.json({
        schemaVersion: 1,
        mode: "recovering",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
        },
        restoreAttempts: 2,
        failureReason:
          "ENOENT: open /home/simonwjackson/.cache/korri/renderer.sock",
      })

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    expect(result.sessiond?.failureReason).toBe("ENOENT: open <path>")
  })

  it("clamps oversized sessiond.failureReason to 256 chars with trailing ellipsis (SEC-003)", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_SOCKET = "/run/user/1000/korri/sessiond.sock"
    const huge = "x".repeat(400)
    const fetchImpl = async () =>
      Response.json({
        schemaVersion: 1,
        mode: "recovering",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
        },
        restoreAttempts: 3,
        failureReason: huge,
      })

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    expect(result.sessiond?.failureReason).toHaveLength(256)
    expect(result.sessiond?.failureReason?.endsWith("\u2026")).toBe(true)
  })

  it("passes short path-free sessiond.failureReason through unchanged (SEC-003)", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SESSIOND_SOCKET = "/run/user/1000/korri/sessiond.sock"
    const fetchImpl = async () =>
      Response.json({
        schemaVersion: 1,
        mode: "recovering",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
        },
        restoreAttempts: 1,
        failureReason: "renderer did not return to home within 5s",
      })

    const result = await Effect.runPromise(
      handleServerStatusWithOverrides({}, { fetchImpl }),
    )

    expect(result.sessiond?.failureReason).toBe(
      "renderer did not return to home within 5s",
    )
  })

  // Direct coverage for the SEC-003 redaction helper. The wire-level
  // tests above exercise the full handler pipeline; these focus on
  // edge cases the helper must handle correctly on its own.
  describe("redactSessiondFailureReason (SEC-003 helper)", () => {
    it("redacts multiple absolute paths in one message", () => {
      expect(
        redactSessiondFailureReason(
          "could not link /home/simon/.korri/state into /run/korri/cur",
        ),
      ).toBe("could not link <path> into <path>")
    })

    it("redacts file:// URLs that follow the absolute-path pattern", () => {
      expect(
        redactSessiondFailureReason(
          "refused to fetch from file:///etc/korri/sessiond.token",
        ),
      ).toBe("refused to fetch from <path>")
    })

    it("preserves a leading slash that is not a path (start of message)", () => {
      // Only multi-segment absolute paths are redacted; a bare
      // leading slash like "/etc" alone passes through unchanged so
      // we don't shred operator vocabulary like "/24 subnet".
      expect(redactSessiondFailureReason("home is /etc; sessiond bailed")).toBe(
        "home is /etc; sessiond bailed",
      )
    })

    it("clamps after redaction so a path-heavy oversized message still fits the cap", () => {
      const longPath = `/${"a".repeat(300)}/${"b".repeat(300)}`
      const result = redactSessiondFailureReason(`fail: ${longPath} oops`)
      expect(result.length).toBeLessThanOrEqual(256)
    })

    it("returns the empty string unchanged", () => {
      expect(redactSessiondFailureReason("")).toBe("")
    })
  })

  it("does not set sessiondUnavailable when sessiond is not configured", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    delete process.env.KORRI_SESSIOND_SOCKET

    const result = await Effect.runPromise(handleServerStatus({}))

    expect(result.sessiond).toBeUndefined()
    expect(result.sessiondUnavailable).toBeUndefined()
    expect(result.runner).toMatchObject({ mode: "running" })
  })
})

async function writeRunnerStatus(input: { readonly mode: string }) {
  const dir = await mkdtemp(join(tmpdir(), "korrid-status-"))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const statusPath = join(dir, "status.json")
  await writeFile(statusPath, `${JSON.stringify(input)}\n`, { mode: 0o600 })
  return statusPath
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
