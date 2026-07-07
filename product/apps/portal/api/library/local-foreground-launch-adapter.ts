import { cleanupLaunchArtifacts } from "@platform/library/config/app-materializer"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import {
  type LaunchResult,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "@platform/library/launcher"
import {
  probeSessiondManagedLaunchStatus,
  terminateSessiondManagedLaunch,
  type SessiondManagedLaunchClientOptions,
  type SessiondManagedLaunchStatusResult,
  type SessiondManagedLaunchTerminateInput,
  type SessiondManagedLaunchTerminateResult,
} from "@platform/library/sessiond-managed-launch-client"
import { isLaunchReadyMode } from "@platform/library/sessiond-managed-launch-protocol"
import type { ForegroundSessionState } from "@platform/session/foreground-session-lifecycle"
import {
  createForegroundSessionOwner,
  type ForegroundExternalIdleResult,
  type ForegroundManagedSessionHandle,
  type ForegroundSessionEvidence,
  type ForegroundSessionOwnerLaunchResult,
  type ForegroundSessionReadinessInput,
  type ForegroundSessionStageResult,
} from "@platform/session/foreground-session-owner"
import type { LaunchLibraryResponse } from "@product/apps/portal/api/library/launch.rpc"
import { Effect } from "effect"

import type { PlayRecordingCoordinator } from "./play-recording-coordinator"

export interface CreateLocalForegroundLaunchOwnerOptions {
  /**
   * Optional override for the sessiond status probe used by the owner's
   * preflight. Tests inject a fake `consultExternalIdle` here; production
   * leaves it unset, in which case the owner consults sessiond when
   * `KORRI_SESSIOND_SOCKET` is configured in `process.env`.
   */
  readonly consultExternalIdle?: () => Promise<ForegroundExternalIdleResult>
  /**
   * Optional recording coordinator. When provided, the owner-observed terminal
   * (`ExitObserved`) completes the launch's pending recording, keyed by the
   * launch's request id (which equals the seeded `launchId`). This terminal
   * covers both direct child launches and sessiond-managed launches: on
   * managed hosts `session.exited` is sessiond's `child-exited` event, so the
   * same `ExitObserved` hook records device plays. Absent = no recording
   * (behavior unchanged).
   */
  readonly playRecordingCoordinator?: PlayRecordingCoordinator
}

function completeRecordingOnExit(
  coordinator: PlayRecordingCoordinator,
): (state: ForegroundSessionState) => Promise<void> {
  return async state => {
    if (state._tag === "ExitObserved") {
      await coordinator.completeLaunch(state.active.requestId)
    }
  }
}

/**
 * Build a `consultExternalIdle` hook that delegates to the shared sessiond
 * status probe. Returns `undefined` when sessiond is not configured, so the
 * owner falls back to owner-local re-entry checking only.
 *
 * Translates `SessiondProbeResult` shapes to the owner's three-valued
 * `ForegroundExternalIdleResult` contract:
 * - `not-configured` → hook returns `{ status: "idle" }` (no authority to
 *    consult; let the owner-local check and spawn-time path handle it).
 * - `ok` + launch-ready mode → `{ status: "idle" }`.
 * - `ok` + non-launch-ready mode (game/launching/restoring/recovering) →
 *    `{ status: "not-idle", mode }`.
 * - `unavailable` / `invalid-payload` → `{ status: "unavailable", reason: "network" }`.
 */
function defaultConsultExternalIdle():
  | (() => Promise<ForegroundExternalIdleResult>)
  | undefined {
  if (!process.env.KORRI_SESSIOND_SOCKET) return undefined
  return async () =>
    externalIdleFromSessiondProbe(await probeSessiondManagedLaunchStatus())
}

export function externalIdleFromSessiondProbe(
  probe: SessiondManagedLaunchStatusResult,
): ForegroundExternalIdleResult {
  if (probe.kind === "not-configured") return { status: "idle" }
  if (probe.kind === "unavailable" || probe.kind === "invalid-payload") {
    return { status: "unavailable", reason: "network" }
  }
  return isLaunchReadyMode(probe.status.mode)
    ? { status: "idle" }
    : { status: "not-idle", mode: probe.status.mode }
}

export interface LocalForegroundLaunchRequest {
  readonly id: string
  readonly spec: LaunchSpec
  readonly spawn: () => Promise<ManagedLaunchResult>
  /**
   * Passive launch-scoped artifact metadata. Cleanup wiring is handled by the
   * lifecycle slices; this adapter only preserves ownership context.
   */
  readonly artifacts?: LaunchArtifacts
  readonly launchId?: string
  readonly createRequestId?: () => string
}

interface PreparedLocalLaunch {
  readonly id: string
  readonly spec: LaunchSpec
  readonly spawn: () => Promise<ManagedLaunchResult>
  readonly artifacts?: LaunchArtifacts
}

interface SpawnedLocalLaunch {
  readonly session: ForegroundManagedSessionHandle
  readonly result: Promise<LaunchLibraryResponse>
  readonly artifacts?: LaunchArtifacts
}

export type LocalForegroundLaunchOwner = ReturnType<
  typeof createLocalForegroundLaunchOwner
>

type SteamTransitionProbe = () => Promise<SessiondManagedLaunchStatusResult>
type SteamTransitionTerminate = (
  input: SessiondManagedLaunchTerminateInput,
) => Promise<SessiondManagedLaunchTerminateResult>

type SteamTransitionLock = <A>(run: () => Promise<A>) => Promise<A>

const steamTransitionLocks = new Map<string, Promise<unknown>>()

export interface PrepareSteamAppIdForegroundTransitionInput {
  readonly spec: LaunchSpec
  readonly probe?: SteamTransitionProbe
  readonly terminate?: SteamTransitionTerminate
  readonly sleep?: (ms: number) => Promise<void>
  readonly withLock?: SteamTransitionLock
  readonly timeoutMs?: number
  readonly pollMs?: number
}

export async function prepareSteamAppIdForegroundTransition(
  input: PrepareSteamAppIdForegroundTransitionInput,
): Promise<LaunchLibraryResponse | undefined> {
  if (!isSteamAppIdLaunchSpec(input.spec)) return undefined
  const lock = input.withLock ?? (run => withSteamTransitionLock("steam-appid", run))
  return await lock(() => prepareSteamAppIdForegroundTransitionUnlocked(input))
}

async function prepareSteamAppIdForegroundTransitionUnlocked(
  input: PrepareSteamAppIdForegroundTransitionInput,
): Promise<LaunchLibraryResponse | undefined> {
  const probe = input.probe ?? (() => probeSessiondManagedLaunchStatus())
  const first = await probe()
  if (first.kind !== "ok") return hostUnavailableFromSessiond(first.message)
  if (isLaunchReadyMode(first.status.mode) || !first.status.active) return undefined

  const terminate =
    input.terminate ??
    (terminateInput => terminateSessiondManagedLaunch(terminateInput, sessiondOptions()))
  const terminated = await terminate({ launchId: first.status.active.launchId })
  if (terminated.kind !== "ok") return hostUnavailableFromSessiond(terminated.message)

  const sleep = input.sleep ?? sleepMs
  const deadline = Date.now() + (input.timeoutMs ?? 15_000)
  const pollMs = input.pollMs ?? 250
  while (Date.now() <= deadline) {
    const current = await probe()
    if (current.kind !== "ok") return hostUnavailableFromSessiond(current.message)
    if (isLaunchReadyMode(current.status.mode) && !current.status.active) {
      return undefined
    }
    await sleep(pollMs)
  }

  return {
    _tag: "PreflightRejected",
    status: "failed",
    exitCode: 121,
    failureKind: "session-busy",
    stderrTail: "timed out waiting for previous Steam AppID session to stop",
    preflightReason: {
      source: "sessiond",
      externalMode: first.status.mode,
      currentSessionId: first.status.active.launchId,
    },
  }
}

function isSteamAppIdLaunchSpec(spec: LaunchSpec): boolean {
  return /(^|\/)korri-steam-app$/.test(spec.command)
}

async function withSteamTransitionLock<A>(
  key: string,
  run: () => Promise<A>,
): Promise<A> {
  const previous = steamTransitionLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => {
    release = resolve
  })
  const queued = previous.then(() => current)
  steamTransitionLocks.set(key, queued)
  await previous
  try {
    return await run()
  } finally {
    release()
    if (steamTransitionLocks.get(key) === queued) steamTransitionLocks.delete(key)
  }
}

function sessiondOptions(): SessiondManagedLaunchClientOptions {
  return { env: process.env }
}

function hostUnavailableFromSessiond(message: string | undefined): LaunchLibraryResponse {
  return {
    _tag: "HostUnavailable",
    status: "failed",
    exitCode: 124,
    failureKind: "host-unavailable",
    ...(message ? { stderrTail: message } : {}),
    hostUnavailableReason: { kind: "network" },
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createLocalForegroundLaunchOwner(
  options: CreateLocalForegroundLaunchOwnerOptions = {},
) {
  const consultExternalIdle =
    options.consultExternalIdle ?? defaultConsultExternalIdle()
  const coordinator = options.playRecordingCoordinator
  return createForegroundSessionOwner<
    LocalForegroundLaunchRequest,
    PreparedLocalLaunch,
    SpawnedLocalLaunch,
    Promise<LaunchLibraryResponse>,
    LaunchLibraryResponse
  >({
    requestIdentity: request => {
      const requestId =
        request.launchId ?? (request.createRequestId ?? createLaunchRequestId)()
      return {
        requestId,
        gameId: request.id,
      }
    },
    ...(consultExternalIdle ? { consultExternalIdle } : {}),
    ...(coordinator
      ? { onStateEntered: completeRecordingOnExit(coordinator) }
      : {}),
    adapter: {
      prepare: async request => ({
        status: "ok",
        value: {
          id: request.id,
          spec: request.spec,
          spawn: request.spawn,
          ...(request.artifacts ? { artifacts: request.artifacts } : {}),
        },
        evidence: { adapter: "local-library" },
      }),
      spawn: spawnLocalLaunch,
      foreground: async () => ({
        status: "ok",
        evidence: { surface: { status: "not-tracked" } },
      }),
      verifyReady: verifyLocalLaunchReady,
      teardown: async ({ prepared }) => {
        await cleanupLocalLaunchArtifacts(prepared.artifacts)
        return {
          status: "ok",
          value: { artifacts: "cleaned" },
        }
      },
      launched: ({ spawned }) => launchResponseAfterManagedReadiness(spawned),
    },
  })
}

export async function launchLocalForegroundSession(
  owner: LocalForegroundLaunchOwner,
  request: LocalForegroundLaunchRequest,
): Promise<LaunchLibraryResponse> {
  let handedOffToOwnerTeardown = false
  try {
    const transitionFailure = await prepareSteamAppIdForegroundTransition({
      spec: request.spec,
    })
    if (transitionFailure) return transitionFailure

    const result = await owner.launch(request)
    if (result._tag === "Launched") handedOffToOwnerTeardown = true
    return await launchResponseFromOwnerResult(result)
  } finally {
    if (!handedOffToOwnerTeardown) {
      await cleanupLocalLaunchArtifacts(request.artifacts)
    }
  }
}

async function cleanupLocalLaunchArtifacts(
  artifacts: LaunchArtifacts | undefined,
): Promise<void> {
  await Effect.runPromise(cleanupLaunchArtifacts(artifacts))
}

async function launchResponseAfterManagedReadiness(
  spawned: SpawnedLocalLaunch,
): Promise<LaunchLibraryResponse> {
  const readiness = spawned.session.ready
  if (!readiness) return await spawned.result

  // `app.library.launch` is an acceptance API for sessiond-managed local
  // launches. Once the foreground owner has prepared, spawned, and moved the
  // session to Running, keep lifetime/terminal failure observation with
  // sessiond instead of holding the HTTP/RPC request open for the game process.
  return { _tag: "Accepted", status: "launched" }
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
      ...(prepared.artifacts ? { artifacts: prepared.artifacts } : {}),
    },
    evidence: {
      command: prepared.spec.command,
      argc: prepared.spec.args.length,
    },
  }
}

/**
 * Tag a response that traversed `launchResponseFromLaunchResult` (which
 * produces back-compat shapes without `_tag`). Routes by `failureKind` to
 * the appropriate U3 discriminator. Idempotent if `_tag` is already set.
 *
 * **DaemonRejected.source limitation:** the `daemonReason.source` schema
 * carries both `"internal-status"` (sessiond's pre-POST internal
 * `GET /managed-launch/status` check rejected) and `"spawn-post"` (the
 * POST itself rejected) as discriminators. Today's `session-launcher.ts`
 * pipeline collapses both into the same `failureKind: "session-busy"`
 * shape before we see the result, so this function emits `"spawn-post"`
 * for any spawn-time session-busy. A future enrichment of
 * `session-launcher.spawnViaSessiond`'s result shape (carrying the
 * sub-source) can update this branch without a wire-schema change.
 */
function tagBackCompatResponse(
  value: LaunchLibraryResponse,
): LaunchLibraryResponse {
  if (value._tag !== undefined) return value
  if (value.status === "launched") return { ...value, _tag: "Accepted" }
  if (value.failureKind === "session-busy") {
    return {
      ...value,
      _tag: "DaemonRejected",
      daemonReason: { source: "spawn-post" },
    }
  }
  if (value.failureKind === "host-unavailable") {
    return {
      ...value,
      _tag: "HostUnavailable",
      hostUnavailableReason: { kind: "network" },
    }
  }
  if (value.failureKind === "host-control-disabled") {
    return {
      ...value,
      _tag: "HostUnavailable",
      hostUnavailableReason: { kind: "request-rejected" },
    }
  }
  return { ...value, _tag: "LaunchFailed" }
}

async function launchResponseFromOwnerResult(
  result: ForegroundSessionOwnerLaunchResult<
    Promise<LaunchLibraryResponse>,
    LaunchLibraryResponse
  >,
): Promise<LaunchLibraryResponse> {
  if (result._tag === "Launched") {
    // Successful path through the owner. The inner promise may still
    // resolve to a failed LaunchLibraryResponse (e.g. when the launcher's
    // result promise materializes a verifyReady failure into a failed
    // LaunchResult). Tag based on shape so callers always see a `_tag`.
    return tagBackCompatResponse(await result.value)
  }
  if (result._tag === "Busy") {
    // Both owner-local and sessiond-preflight rejections wear the same
    // failureKind/exitCode for back-compat callers; the `_tag` and
    // `preflightReason.source` discriminate for new callers.
    return {
      _tag: "PreflightRejected",
      status: "failed",
      exitCode: launchFailureExitCode("session-busy"),
      failureKind: "session-busy",
      stderrTail: result.rejection.message,
      // SEC-001 (task-017): `currentState` is the in-process owner FSM
      // tag (e.g. `Spawning`, `Running`, `TearingDown`). It is preserved
      // on the internal `ForegroundSessionBusyRejection` for logging and
      // diagnostic surfaces, but it is NOT placed on the wire response.
      // `app.library.launch` is unauthenticated on the trusted-LAN
      // deployment shape; redacting `currentState` removes the only
      // finer-grained state visibility this surface offered above what
      // `app.server.status` already exposes (sessiond mode). If a future
      // authenticated debug surface needs it, re-add via a separate
      // authenticated RPC rather than over-broadening this one.
      preflightReason: {
        source: result.rejection.source ?? "owner-local",
        ...(result.rejection.externalMode !== undefined
          ? { externalMode: result.rejection.externalMode }
          : {}),
        // task-013 AC #2: stable correlation identifiers for the
        // currently-active launch. Process identity stays daemon-
        // private (see ForegroundSessionBusyRejection docstring).
        ...(result.rejection.currentRequestId !== undefined
          ? { currentRequestId: result.rejection.currentRequestId }
          : {}),
        ...(result.rejection.currentGameId !== undefined
          ? { currentGameId: result.rejection.currentGameId }
          : {}),
        ...(result.rejection.currentSessionId !== undefined
          ? { currentSessionId: result.rejection.currentSessionId }
          : {}),
      },
    }
  }
  if (result._tag === "ExternalUnavailable") {
    // Preserve the existing 401 → `host-control-disabled` / exit-126
    // contract from `session-launcher.ts`; network failures continue to map
    // to `host-unavailable` / exit-124.
    const failureKind =
      result.reason === "request-rejected"
        ? ("host-control-disabled" as const)
        : ("host-unavailable" as const)
    return {
      _tag: "HostUnavailable",
      status: "failed",
      exitCode: launchFailureExitCode(failureKind),
      failureKind,
      stderrTail: result.message,
      hostUnavailableReason: { kind: result.reason },
    }
  }

  // `_tag === "Failed"`: spawn-pipeline failure. `result.failure` carries the
  // LaunchLibraryResponse from `spawnLocalLaunch` when it surfaces a
  // managed-launch failure; otherwise we fabricate a `command-failed`
  // shape. Either way `tagBackCompatResponse` routes the right `_tag`
  // based on `failureKind` (sessiond `session-busy` → DaemonRejected,
  // host-unavailable / host-control-disabled → HostUnavailable, etc.).
  const fallback: LaunchLibraryResponse = result.failure ?? {
    status: "failed",
    exitCode: launchFailureExitCode("command-failed"),
    failureKind: "command-failed",
    stderrTail: result.message,
  }
  return tagBackCompatResponse(fallback)
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
