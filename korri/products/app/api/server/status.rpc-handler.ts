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

    // `unavailable` (network/decode error), `token-rejected` (HTTP 401), and
    // `missing-token` (no token file readable) all surface as
    // `sessiondUnavailable: true` to the renderer/monitoring. The launch-path
    // preflight distinguishes between them so it can preserve the existing
    // `failureKind` mappings from `session-launcher.ts`'s spawn-time handling
    // (401 → `host-control-disabled`/126; missing-token → same; network →
    // `host-unavailable`/124). See `local-foreground-launch-adapter.ts`'s
    // `defaultConsultExternalIdle`.
    const sessiondUnreachable =
      sessiondProbe.kind === "unavailable" ||
      sessiondProbe.kind === "token-rejected" ||
      sessiondProbe.kind === "missing-token"

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
      ...(sessiondUnreachable ? { sessiondUnavailable: true } : {}),
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

/**
 * Result of a one-shot probe of sessiond's `/managed-launch/status`.
 *
 * - `ok`            → daemon answered; `summary` carries the decoded mode/active.
 * - `unavailable`   → daemon unreachable: network error, non-2xx response other
 *                     than 401, or decode failure.
 * - `token-rejected`→ daemon answered with HTTP 401. Distinguished from
 *                     `unavailable` so the launch-path preflight can preserve
 *                     the `failureKind: "host-control-disabled"` mapping from
 *                     `session-launcher.ts`'s spawn-time 401 handling.
 * - `missing-token` → `KORRI_SESSIOND_URL` is set but no token could be read
 *                     (`KORRI_SESSIOND_TOKEN` and `KORRI_SESSIOND_TOKEN_FILE`
 *                     both absent or unreadable). The launch-path preflight
 *                     treats this as "defer to the spawn" so the existing
 *                     `session-launcher.ts` mapping from missing-token to
 *                     `failureKind: "host-control-disabled"` / exit 126 still
 *                     fires. App-server-status maps it to `sessiondUnavailable`
 *                     so the operator-facing signal is preserved.
 * - `not-configured`→ `KORRI_SESSIOND_URL` is unset; the host is not paired
 *                     with sessiond.
 */
export type SessiondProbeResult =
  | { readonly kind: "ok"; readonly summary: SessiondLifecycleSummary }
  | { readonly kind: "unavailable" }
  | { readonly kind: "token-rejected" }
  | { readonly kind: "missing-token" }
  | { readonly kind: "not-configured" }

/**
 * `probeSessiondStatus` is the canonical server-side proxy that translates
 * sessiond's authoritative lifecycle state into the `app.server.status`
 * response shape. The renderer reads sessiond mode through this proxy via
 * standard `/api/rpc` polling — sessiond is NOT a renderer-facing protocol.
 *
 * Both the `app.server.status` consumer here and the `ForegroundSessionOwner`
 * preflight (`local-foreground-launch-adapter.ts`) call this function. They
 * share one definition of "what mode is sessiond in?" so the renderer atom
 * and the launch preflight cannot disagree.
 *
 * See: docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md
 */
/**
 * Pure-async version of the sessiond status probe. Exported so callers
 * outside the Effect RPC pipeline (such as the launch-adapter preflight in
 * `local-foreground-launch-adapter.ts`) can consume the same shared
 * definition of "what mode is sessiond in?" The Effect-wrapped
 * `probeSessiondStatus` below delegates here.
 *
 * Accepts the env as a parameter (not read directly) so tests can drive both
 * code paths through a single injection seam.
 */
export async function probeSessiondManagedLaunchStatus(
  options: {
    readonly env?: NodeJS.ProcessEnv
    readonly fetchImpl?: (
      input: string,
      init?: RequestInit,
    ) => Promise<Response>
    readonly timeoutMs?: number
  } = {},
): Promise<SessiondProbeResult> {
  const env = options.env ?? process.env
  const url = env.KORRI_SESSIOND_URL
  if (!url) return { kind: "not-configured" }
  const token = await readSessiondToken(env)
  if (!token) return { kind: "missing-token" }
  const effectiveFetch = options.fetchImpl ?? globalThis.fetch
  try {
    const response = await fetchWithTimeout(
      effectiveFetch,
      `${url.replace(/\/$/, "")}/managed-launch/status`,
      { headers: { "x-korri-sessiond-token": token } },
      options.timeoutMs ?? DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS,
    )
    if (response.status === 401) return { kind: "token-rejected" }
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
                // Phase 4D / Track A finishing follow-up. Forward
                // the optional sub-phase when present.
                ...(decoded.active.phase
                  ? { phase: decoded.active.phase }
                  : {}),
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
}

function probeSessiondStatus(
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>,
) {
  return Effect.tryPromise({
    try: () => probeSessiondManagedLaunchStatus({ fetchImpl }),
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
