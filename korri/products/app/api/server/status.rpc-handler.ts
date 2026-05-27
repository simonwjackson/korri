import { readFile, stat } from "node:fs/promises"
import { hostname } from "node:os"
import { join } from "node:path"
import { DataError } from "@shared/api/rpc/errors"
import { decodeSessiondManagedLaunchStatus } from "@shared/library/sessiond-managed-launch-protocol"
import { Effect } from "effect"
import { isStreamControlEnabled } from "../stream/control-mode"
import {
  ServerRunnerStatus,
  type ServerStatusPayload,
  ServerStatusResponse,
  SessiondLifecycleActive,
  SessiondLifecycleSummary,
} from "./status.rpc"

type RunnerMode =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "exited"
  | "failed"

const RUNNER_STATUS_STALE_MS = 10 * 60 * 1000
const RUNNER_MODES = new Set<RunnerMode>([
  "idle",
  "starting",
  "running",
  "stopping",
  "exited",
  "failed",
])

const DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS = 2_000

export interface ServerStatusOverrides {
  readonly fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
  readonly nowMs?: number
}

export const handleServerStatus = (_payload: typeof ServerStatusPayload.Type) =>
  buildServerStatusEffect({})

/**
 * Test-only seam: allows injecting fetch and clock overrides without
 * bending the RPC handler signature. Production callers should go
 * through `handleServerStatus`.
 */
export const handleServerStatusWithOverrides = (
  _payload: typeof ServerStatusPayload.Type,
  overrides: ServerStatusOverrides = {},
) => buildServerStatusEffect(overrides)

const buildServerStatusEffect = (overrides: ServerStatusOverrides) =>
  Effect.gen(function* () {
    const runner = yield* readRunnerStatus(
      defaultGameStreamStatusPath(process.env),
      overrides.nowMs,
    )
    const enabled = isStreamControlEnabled(process.env)
    const serverId = process.env.KORRI_SERVER_ID ?? hostname()
    const displayName =
      process.env.KORRI_SERVER_NAME ?? `Korri Server on ${serverId}`

    const sessiondProbe = yield* probeSessiondStatus(overrides.fetchImpl)

    return new ServerStatusResponse({
      serverId,
      displayName,
      protocolVersion: "1",
      capabilities: ["source", "stream"],
      status: enabled ? "available" : "stream-unavailable",
      streamControl: enabled ? "enabled" : "disabled",
      catalog: enabled ? "available" : "unavailable",
      ...(runner ? { runner } : {}),
      ...(sessiondProbe.kind === "ok"
        ? { sessiond: sessiondProbe.summary }
        : {}),
      ...(sessiondProbe.kind === "unavailable"
        ? { sessiondUnavailable: true }
        : {}),
      ...(enabled ? {} : { message: "Korri stream control is not enabled" }),
    })
  })

function defaultGameStreamStatusPath(
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (env.KORRI_GAME_STREAM_STATUS_PATH)
    return env.KORRI_GAME_STREAM_STATUS_PATH
  if (env.XDG_RUNTIME_DIR) {
    return join(env.XDG_RUNTIME_DIR, "korri-game-stream", "status.json")
  }
  return undefined
}

function readRunnerStatus(statusPath: string | undefined, nowMs?: number) {
  if (!statusPath) return Effect.succeed(undefined)
  return Effect.tryPromise({
    try: async () => {
      let raw: string
      let modifiedAt: Date
      try {
        const stats = await stat(statusPath)
        modifiedAt = stats.mtime
        raw = await readFile(statusPath, "utf8")
      } catch (error) {
        if (isFileNotFoundError(error)) return undefined
        throw error
      }
      const parsed = JSON.parse(raw) as unknown
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("mode" in parsed)
      ) {
        return undefined
      }
      const mode = (parsed as { readonly mode?: unknown }).mode
      if (typeof mode !== "string") return undefined
      const runnerMode = mode as RunnerMode
      if (!RUNNER_MODES.has(runnerMode)) return undefined
      const now = nowMs ?? Date.now()
      return new ServerRunnerStatus({
        mode: runnerMode,
        observedAt: modifiedAt.toISOString(),
        stale: now - modifiedAt.getTime() > RUNNER_STATUS_STALE_MS,
      })
    },
    catch: error =>
      new DataError({
        reason: "ReadFailed",
        message:
          error instanceof Error ? error.message : "stream status read failed",
      }),
  })
}

type SessiondProbeResult =
  | { readonly kind: "ok"; readonly summary: SessiondLifecycleSummary }
  | { readonly kind: "unavailable" }
  | { readonly kind: "not-configured" }

function probeSessiondStatus(
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>,
) {
  return Effect.tryPromise({
    try: async (): Promise<SessiondProbeResult> => {
      const url = process.env.KORRI_SESSIOND_URL
      if (!url) return { kind: "not-configured" }
      const token = await readSessiondToken(process.env)
      if (!token) return { kind: "unavailable" }
      const effectiveFetch = fetchImpl ?? globalThis.fetch
      try {
        const response = await fetchWithTimeout(
          effectiveFetch,
          `${url.replace(/\/$/, "")}/managed-launch/status`,
          { headers: { "x-korri-sessiond-token": token } },
          DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS,
        )
        if (!response.ok) return { kind: "unavailable" }
        const body = await response.json()
        const decoded = decodeSessiondManagedLaunchStatus(body)
        return {
          kind: "ok",
          summary: new SessiondLifecycleSummary({
            mode: decoded.mode,
            restoreAttempts: decoded.restoreAttempts,
            ...(decoded.active
              ? {
                  active: new SessiondLifecycleActive({
                    launchId: decoded.active.launchId,
                    mode: decoded.active.mode,
                  }),
                }
              : {}),
            ...(decoded.failureReason
              ? { failureReason: decoded.failureReason }
              : {}),
          }),
        }
      } catch {
        return { kind: "unavailable" }
      }
    },
    catch: error =>
      new DataError({
        reason: "ReadFailed",
        message:
          error instanceof Error
            ? error.message
            : "sessiond status probe failed",
      }),
  })
}

async function readSessiondToken(
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (env.KORRI_SESSIOND_TOKEN) return env.KORRI_SESSIOND_TOKEN
  if (env.KORRI_SESSIOND_TOKEN_FILE) {
    try {
      const raw = await readFile(env.KORRI_SESSIOND_TOKEN_FILE, "utf8")
      return raw.trim()
    } catch {
      return undefined
    }
  }
  return undefined
}

async function fetchWithTimeout(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  if ("unref" in timeout && typeof timeout.unref === "function") timeout.unref()
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  )
}
