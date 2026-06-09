import { readFile, stat } from "node:fs/promises"
import { hostname } from "node:os"
import { join } from "node:path"
import { DataError } from "@platform/api/rpc/errors"
import { projectSessiondLifecycleSummary } from "@platform/library/sessiond-lifecycle-projections"
import {
  probeSessiondManagedLaunchStatus as probeSessiondManagedLaunchClientStatus,
  type SessiondManagedLaunchClientFailure,
} from "@platform/library/sessiond-managed-launch-client"
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
    const serverId = process.env.KORRI_DAEMON_ID ?? hostname()
    const displayName =
      process.env.KORRI_DAEMON_NAME ?? `Korri Daemon on ${serverId}`

    const sessiondProbe = yield* probeSessiondStatus(overrides.fetchImpl)

    // Socket IPC failures surface as `sessiondUnavailable: true` to
    // the renderer/monitoring. The launch-path preflight distinguishes
    // not-configured from unavailable so spawn-time handling can preserve
    // the existing host-unavailable/control-disabled mappings.
    const sessiondUnreachable = sessiondProbe.kind === "unavailable"

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
 * - `unavailable`   → daemon unreachable: socket failure, non-2xx response,
 *                     invalid JSON, or schema mismatch.
 * - `not-configured`→ `KORRI_SESSIOND_SOCKET` is unset; the host is not paired
 *                     with sessiond.
 */
type SessiondProbeResult =
  | { readonly kind: "ok"; readonly summary: SessiondLifecycleSummary }
  | { readonly kind: "unavailable" }
  | { readonly kind: "request-rejected" }
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
async function probeSessiondManagedLaunchStatus(
  options: {
    readonly env?: NodeJS.ProcessEnv
    readonly fetchImpl?: (
      input: string,
      init?: RequestInit,
    ) => Promise<Response>
    readonly timeoutMs?: number
  } = {},
): Promise<SessiondProbeResult> {
  const result = await probeSessiondManagedLaunchClientStatus({
    env: options.env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  })
  if (result.kind !== "ok") return mapSessiondProbeFailure(result)
  const summary = projectSessiondLifecycleSummary(result.status, {
    failureReason: redactSessiondFailureReason,
  })
  return {
    kind: "ok",
    summary: new SessiondLifecycleSummary({
      mode: summary.mode,
      restoreAttempts: summary.restoreAttempts,
      ...(summary.active
        ? { active: new SessiondLifecycleActive(summary.active) }
        : {}),
      ...(summary.failureReason
        ? { failureReason: summary.failureReason }
        : {}),
    }),
  }
}

/**
 * SEC-003 (task-036) bounding seam for sessiond's `failureReason`.
 *
 * `failureReason` is forwarded onto the unauthenticated-on-LAN
 * `app.server.status` wire, so the status handler is the right place
 * to bound it. Three guards, applied in order:
 *
 * 1. **Path redaction.** Absolute Unix path-shaped substrings
 *    (`/foo/bar...`) and `file://` URLs are replaced with `<path>`
 *    so OS error messages do not leak `/home/<user>/...`,
 *    `/run/korri-...`, daemon install paths, or socket locations
 *    to a casual LAN peer.
 * 2. **Length clamp.** Anything over 256 chars is truncated with a
 *    trailing `…` so a runaway stack-trace fragment cannot dump
 *    unbounded bytes to the wire.
 * 3. **Otherwise pass-through.** Short, path-free strings reach
 *    operators verbatim so the diagnostic value of
 *    `failureReason` is preserved.
 *
 * Exported only for direct unit testing in this file's test
 * companion; production callers go through
 * the internal sessiond status projection helper.
 */
export function redactSessiondFailureReason(reason: string): string {
  const pathRedacted = reason
    .replace(/file:\/\/[^\s]+/g, "<path>")
    .replace(/\/(?:[a-zA-Z0-9_.+-]+\/)+[a-zA-Z0-9_.+-]+/g, "<path>")
  if (pathRedacted.length <= SESSIOND_FAILURE_REASON_MAX_LENGTH) {
    return pathRedacted
  }
  return `${pathRedacted.slice(0, SESSIOND_FAILURE_REASON_MAX_LENGTH - 1)}…`
}

const SESSIOND_FAILURE_REASON_MAX_LENGTH = 256

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

function mapSessiondProbeFailure(
  failure: SessiondManagedLaunchClientFailure,
): Exclude<SessiondProbeResult, { readonly kind: "ok" }> {
  if (failure.kind === "invalid-payload") return { kind: "unavailable" }
  return { kind: failure.kind }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  )
}
