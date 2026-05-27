import type { LaunchLibraryResponse } from "@app/api/library/launch.rpc"
import type {
  LaunchResult,
  LaunchSpec,
  ManagedLaunchResult,
} from "@shared/library/launcher"
import {
  createForegroundSessionOwner,
  type ForegroundManagedSessionHandle,
  type ForegroundSessionOwnerLaunchResult,
  type ForegroundSessionStageResult,
} from "@shared/stream/foreground-session-owner"

const SESSION_BUSY_EXIT_CODE = 121
const MANAGED_LAUNCH_UNSUPPORTED_EXIT_CODE = 125

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
    Promise<LaunchLibraryResponse>
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
      verifyReady: async () => ({
        status: "ok",
        value: { gate: "managed-child-exit" },
      }),
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

async function spawnLocalLaunch(
  prepared: PreparedLocalLaunch,
): Promise<ForegroundSessionStageResult<SpawnedLocalLaunch>> {
  const spawned = await prepared.spawn()
  if (spawned.status === "failed") {
    const response = launchResponseFromLaunchResult(spawned.result)
    return {
      status: "failed",
      message: spawned.result.stderrTail ?? "local launch failed before spawn",
      evidence: { response },
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
  result: ForegroundSessionOwnerLaunchResult<Promise<LaunchLibraryResponse>>,
): Promise<LaunchLibraryResponse> {
  if (result._tag === "Launched") return await result.value
  if (result._tag === "Busy") {
    return {
      status: "failed",
      exitCode: SESSION_BUSY_EXIT_CODE,
      failureKind: "session-busy",
      stderrTail: result.rejection.message,
    }
  }

  return (
    responseFromFailureEvidence(result.evidence) ?? {
      status: "failed",
      exitCode: MANAGED_LAUNCH_UNSUPPORTED_EXIT_CODE,
      stderrTail: result.message,
    }
  )
}

function launchResponseFromLaunchResult(result: LaunchResult): LaunchLibraryResponse {
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

function responseFromFailureEvidence(
  evidence: Readonly<Record<string, unknown>> | undefined,
): LaunchLibraryResponse | undefined {
  const response = evidence?.response
  if (!response || typeof response !== "object") return undefined
  const candidate = response as LaunchLibraryResponse
  return candidate.status === "launched" || candidate.status === "failed"
    ? candidate
    : undefined
}

function createLaunchRequestId(): string {
  return globalThis.crypto.randomUUID()
}
