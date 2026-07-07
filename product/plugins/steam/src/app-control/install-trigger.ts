import { Effect } from "effect"
import { sanitizeSteamEvidenceExcerpt } from "../observability/evidence-sanitizer"
import {
  collectSteamBusySnapshot,
  type SteamBusySnapshot,
} from "../observability/install-activity"
import { collectSteamInstallSnapshot } from "../observability/install-state"
import {
  materializeSteamDesiredState,
  noopSteamLifecycle,
  type SteamLifecycle,
  type SteamStateFileSystem,
  type SteamStateLock,
} from "../state-materializer"
import {
  findActiveSteamInstallRequest,
  upsertSteamInstallRequest,
} from "./install-request-ledger"

export interface SteamInstallTriggerInput {
  readonly appId: string
  readonly mode?: "install" | "update"
  readonly authorized?: boolean
  readonly helperPath?: string
  readonly prepare?: (input: {
    readonly appId: string
    readonly mode: "install" | "update"
  }) => Promise<void>
  readonly spawn?: (
    command: string,
    args: readonly string[],
  ) => Promise<SteamInstallSpawnResult>
}

export interface SteamInstallSpawnResult {
  readonly exitCode: number
  readonly stdout?: string
  readonly stderr?: string
}

export interface PrepareSteamAppInstallStateInput {
  readonly appId: string
  readonly stateRoot: string
  readonly compatTool: string
  readonly fs?: SteamStateFileSystem
  readonly lifecycle?: SteamLifecycle
  readonly lock?: SteamStateLock
  readonly collectBusy?: () => Promise<SteamBusySnapshot>
}

export async function prepareSteamAppInstallState(
  input: PrepareSteamAppInstallStateInput,
): Promise<void> {
  await Effect.runPromise(
    materializeSteamDesiredState({
      desired: {
        stateRoot: input.stateRoot,
        target: `steam://rungameid/${input.appId}`,
        defaultCompatTool: input.compatTool,
        suppressInterstitials: true,
        acceptEulas: true,
      },
      fs: input.fs,
      lifecycle: input.lifecycle ?? noopSteamLifecycle,
      lock: input.lock,
      shutdownGuard: async () => {
        const busy = await (input.collectBusy ??
          (() => collectSteamBusySnapshot({ steamHome: input.stateRoot })))()
        if (busy.state === "idle") return { allowed: true }
        return {
          allowed: false,
          reason:
            busy.state === "active"
              ? `steam-busy: ${busy.evidence.join("; ")}`
              : `steam-busy: unable to prove Steam install activity is idle (${busy.evidence.join("; ")})`,
        }
      },
    }),
  )
}

export async function requestSteamAppInstall(input: SteamInstallTriggerInput) {
  if (!input.authorized) {
    return {
      outcome: "rejected" as const,
      state: "failed" as const,
      requestId: "unauthorized",
      message: "Install request was not authorized",
    }
  }
  if (!/^\d+$/.test(input.appId)) {
    return {
      outcome: "rejected" as const,
      state: "failed" as const,
      requestId: "invalid",
      message: "Steam AppID must be numeric",
    }
  }
  const current = await collectSteamInstallSnapshot({ appId: input.appId })
  if (current.state === "installed") {
    return {
      outcome: "already-installed" as const,
      requestId: `${input.appId}:installed`,
      ...current,
    }
  }
  const existing = findActiveSteamInstallRequest({
    appId: input.appId,
    mode: input.mode,
  })
  if (existing) {
    return {
      outcome: "already-in-progress" as const,
      state: existing.state,
      requestId: existing.requestId,
      appId: input.appId,
      observedAt: new Date().toISOString(),
      message: "Steam install request is already in progress",
    }
  }
  const helper = input.helperPath ?? process.env.KORRI_STEAM_APP_INSTALL_HELPER
  const rejectedRequestId = `rejected:${input.appId}`
  if (!helper) {
    return {
      outcome: "rejected" as const,
      state: "failed" as const,
      requestId: rejectedRequestId,
      message: "Steam install helper is not configured",
    }
  }
  if (input.prepare) {
    try {
      await input.prepare({ appId: input.appId, mode: input.mode ?? "install" })
    } catch (error) {
      return {
        outcome: "rejected" as const,
        state: "failed" as const,
        requestId: rejectedRequestId,
        message: sanitizeSteamEvidenceExcerpt(errorMessage(error), {
          maxLength: 180,
        }),
      }
    }
  }
  const spawn = input.spawn ?? spawnCommand
  const result = await spawn(helper, [input.appId])
  if (result.exitCode !== 0) {
    return {
      outcome: "rejected" as const,
      state: "failed" as const,
      requestId: rejectedRequestId,
      message: sanitizeSteamEvidenceExcerpt(
        result.stderr ?? result.stdout ?? "Steam install helper failed",
        { maxLength: 180 },
      ),
    }
  }
  const entry = upsertSteamInstallRequest({
    appId: input.appId,
    mode: input.mode,
  })
  return {
    outcome: "accepted" as const,
    state: "requested" as const,
    requestId: entry.requestId,
    appId: input.appId,
    observedAt: new Date().toISOString(),
    message: "Steam install request accepted",
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message
  return String(error)
}

async function spawnCommand(
  command: string,
  args: readonly string[],
): Promise<SteamInstallSpawnResult> {
  const proc = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { exitCode, stdout, stderr }
}
