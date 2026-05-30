import type { LaunchLibraryResponse } from "@app/api/library/launch.rpc"
import { probeSessiondManagedLaunchStatus } from "@app/api/server/status.rpc-handler"
import {
  type LaunchResult,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "@shared/library/launcher"
import { isLaunchReadyMode } from "@shared/library/sessiond-managed-launch-protocol"
import {
  createForegroundSessionOwner,
  type ForegroundExternalIdleResult,
  type ForegroundManagedSessionHandle,
  type ForegroundSessionEvidence,
  type ForegroundSessionOwnerLaunchResult,
  type ForegroundSessionReadinessInput,
  type ForegroundSessionStageResult,
} from "@shared/stream/foreground-session-owner"

export interface CreateLocalForegroundLaunchOwnerOptions {
  /**
   * Optional override for the sessiond status probe used by the owner's
   * preflight. Tests inject a fake `consultExternalIdle` here; production
   * leaves it unset, in which case the owner consults sessiond when
   * `KORRI_SESSIOND_URL` is configured in `process.env`.
   */
  readonly consultExternalIdle?: () => Promise<ForegroundExternalIdleResult>
}

/**
 * Build a `consultExternalIdle` hook that delegates to the shared sessiond
 * status probe. Returns `undefined` when sessiond is not configured, so the
 * owner falls back to owner-local re-entry checking only.
 *
 * Translates `SessiondProbeResult` shapes to the owner's three-valued
 * `ForegroundExternalIdleResult` contract:
 * - `not-configured` → hook is omitted (no external authority to consult).
 * - `ok` + launch-ready mode → `{ status: "idle" }`.
 * - `ok` + non-launch-ready mode (game/launching/restoring/recovering) →
 *    `{ status: "not-idle", mode }`.
 * - `unavailable` → `{ status: "unavailable", reason: "network" }`.
 * - `token-rejected` → `{ status: "unavailable", reason: "token-rejected" }`,
 *    preserving the existing 401 → `host-control-disabled` mapping from
 *    `session-launcher.ts`.
 */
export function defaultConsultExternalIdle(): 
  | (() => Promise<ForegroundExternalIdleResult>)
  | undefined {
  if (!process.env.KORRI_SESSIOND_URL) return undefined
  return async () => {
    const probe = await probeSessiondManagedLaunchStatus()
    if (probe.kind === "not-configured") return { status: "idle" }
    if (probe.kind === "unavailable")
      return { status: "unavailable", reason: "network" }
    if (probe.kind === "token-rejected")
      return { status: "unavailable", reason: "token-rejected" }
    return isLaunchReadyMode(probe.summary.mode)
      ? { status: "idle" }
      : { status: "not-idle", mode: probe.summary.mode }
  }
}

export interface LocalForegroundLaunchRequest {
  readonly id: string
  readonly spec: LaunchSpec
  readonly spawn: () => Promise<ManagedLaunchResult>
  readonly createRequestId?: () => string
}

interface PreparedLocalLaunch {
  readonly id: string
  readonly spec: LaunchSpec
  readonly spawn: () => Promise<ManagedLaunchResult>
}

interface SpawnedLocalLaunch {
  readonly session: ForegroundManagedSessionHandle
  readonly result: Promise<LaunchLibraryResponse>
}

export type LocalForegroundLaunchOwner = ReturnType<
  typeof createLocalForegroundLaunchOwner
>

export function createLocalForegroundLaunchOwner(
  options: CreateLocalForegroundLaunchOwnerOptions = {},
) {
  const consultExternalIdle =
    options.consultExternalIdle ?? defaultConsultExternalIdle()
  return createForegroundSessionOwner<
    LocalForegroundLaunchRequest,
    PreparedLocalLaunch,
    SpawnedLocalLaunch,
    Promise<LaunchLibraryResponse>,
    LaunchLibraryResponse
  >({
    requestIdentity: request => ({
      requestId: (request.createRequestId ?? createLaunchRequestId)(),
      gameId: request.id,
    }),
    ...(consultExternalIdle ? { consultExternalIdle } : {}),
    adapter: {
      prepare: async request => ({
        status: "ok",
        value: {
          id: request.id,
          spec: request.spec,
          spawn: request.spawn,
        },
        evidence: { adapter: "local-library" },
      }),
      spawn: spawnLocalLaunch,
      foreground: async () => ({
        status: "ok",
        evidence: { surface: { status: "not-tracked" } },
      }),
      verifyReady: verifyLocalLaunchReady,
      launched: ({ spawned }) => spawned.result,
    },
  })
}

export async function launchLocalForegroundSession(
  owner: LocalForegroundLaunchOwner,
  request: LocalForegroundLaunchRequest,
): Promise<LaunchLibraryResponse> {
  const result = await owner.launch(request)
  return await launchResponseFromOwnerResult(result)
}

async function verifyLocalLaunchReady(
  input: ForegroundSessionReadinessInput<
    LocalForegroundLaunchRequest,
    PreparedLocalLaunch,
    SpawnedLocalLaunch
  >,
): Promise<ForegroundSessionStageResult<ForegroundSessionEvidence>> {
  const readiness = input.spawned.session.ready
  if (!readiness) {
    return {
      status: "ok",
      value: { gate: "managed-child-exit" },
    }
  }

  const result = await readiness
  if (result.status === "ok") {
    return {
      status: "ok",
      value: result.evidence ?? { gate: "managed-session-ready" },
    }
  }

  return {
    status: "failed",
    message: result.message,
    ...(result.evidence ? { evidence: result.evidence } : {}),
  }
}

async function spawnLocalLaunch(
  prepared: PreparedLocalLaunch,
): Promise<
  ForegroundSessionStageResult<SpawnedLocalLaunch, LaunchLibraryResponse>
> {
  const spawned = await prepared.spawn()
  if (spawned.status === "failed") {
    const response = launchResponseFromLaunchResult(spawned.result)
    return {
      status: "failed",
      message: spawned.result.stderrTail ?? "local launch failed before spawn",
      evidence: {
        exitCode: response.status === "failed" ? response.exitCode : 0,
      },
      failure: response,
    }
  }

  return {
    status: "ok",
    value: {
      session: spawned.session,
      result: spawned.result.then(launchResponseFromLaunchResult),
    },
    evidence: {
      command: prepared.spec.command,
      argc: prepared.spec.args.length,
    },
  }
}

async function launchResponseFromOwnerResult(
  result: ForegroundSessionOwnerLaunchResult<
    Promise<LaunchLibraryResponse>,
    LaunchLibraryResponse
  >,
): Promise<LaunchLibraryResponse> {
  if (result._tag === "Launched") return await result.value
  if (result._tag === "Busy") {
    // Both owner-local and sessiond-preflight rejections surface as
    // `failureKind: "session-busy"` on the wire for back-compat; the source
    // discriminator lives on `result.rejection.source` (and will be
    // forwarded as `PreflightRejected.reason.source` in U3).
    return {
      status: "failed",
      exitCode: launchFailureExitCode("session-busy"),
      failureKind: "session-busy",
      stderrTail: result.rejection.message,
    }
  }
  if (result._tag === "ExternalUnavailable") {
    // Preserve the existing 401 → `host-control-disabled` / exit-126
    // contract from `session-launcher.ts`; network failures continue to map
    // to `host-unavailable` / exit-124.
    const failureKind =
      result.reason === "token-rejected"
        ? ("host-control-disabled" as const)
        : ("host-unavailable" as const)
    return {
      status: "failed",
      exitCode: launchFailureExitCode(failureKind),
      failureKind,
      stderrTail: result.message,
    }
  }

  return (
    result.failure ?? {
      status: "failed",
      exitCode: launchFailureExitCode("command-failed"),
      failureKind: "command-failed",
      stderrTail: result.message,
    }
  )
}

function launchResponseFromLaunchResult(
  result: LaunchResult,
): LaunchLibraryResponse {
  if (result.status === "launched") return { status: "launched" }
  return result.stderrTail !== undefined
    ? {
        status: "failed",
        exitCode: result.exitCode,
        stderrTail: result.stderrTail,
        ...(result.failureKind ? { failureKind: result.failureKind } : {}),
      }
    : {
        status: "failed",
        exitCode: result.exitCode,
        ...(result.failureKind ? { failureKind: result.failureKind } : {}),
      }
}

function createLaunchRequestId(): string {
  return globalThis.crypto.randomUUID()
}
