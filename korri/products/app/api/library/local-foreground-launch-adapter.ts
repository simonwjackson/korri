import type { LaunchLibraryResponse } from "@app/api/library/launch.rpc"
import {
  type LaunchResult,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "@shared/library/launcher"
import {
  createForegroundSessionOwner,
  type ForegroundManagedSessionHandle,
  type ForegroundSessionEvidence,
  type ForegroundSessionOwnerLaunchResult,
  type ForegroundSessionReadinessInput,
  type ForegroundSessionStageResult,
} from "@shared/stream/foreground-session-owner"

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

export function createLocalForegroundLaunchOwner() {
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
    return {
      status: "failed",
      exitCode: launchFailureExitCode("session-busy"),
      failureKind: "session-busy",
      stderrTail: result.rejection.message,
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
