import {
  type LaunchExtras,
  type Launcher,
  type LaunchFailureKind,
  type LaunchResult,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "./launcher"
import {
  probeSessiondManagedLaunchStatus,
  requestSessiondManagedLaunchStart,
  resolveSessiondManagedLaunchToken,
  type SessiondManagedLaunchClientFailure,
  terminateSessiondManagedLaunch,
} from "./sessiond-managed-launch-client"
import { observeSessiondManagedLaunchEvents } from "./sessiond-managed-launch-event-observer"
import { isLaunchReadyMode } from "./sessiond-managed-launch-protocol"

export interface SessionLauncherOptions {
  readonly url: string
  readonly token?: string
  readonly tokenFile?: string
  readonly fetchImpl?: SessionLauncherFetch
  readonly requestTimeoutMs?: number
}

export type SessionLauncherFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>

export function createSessionLauncher(
  options: SessionLauncherOptions,
): Launcher {
  return {
    async run(spec) {
      return launchViaSessiond(spec, options)
    },
    async spawn(spec, extras) {
      return spawnViaSessiond(spec, options, extras)
    },
  }
}

export function createSessionLauncherFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Launcher | undefined {
  const url = env.KORRI_SESSIOND_URL
  if (!url) return undefined

  return createSessionLauncher({
    url,
    token: env.KORRI_SESSIOND_TOKEN,
    tokenFile: env.KORRI_SESSIOND_TOKEN_FILE,
  })
}

export async function launchViaSessiond(
  spec: LaunchSpec,
  options: SessionLauncherOptions,
): Promise<LaunchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const token = await resolveSessiondManagedLaunchToken({ ...options, env: {} })
  if (!token) {
    return {
      status: "failed",
      exitCode: 126,
      stderrTail:
        "sessiond launch rejected: missing KORRI_SESSIOND_TOKEN or KORRI_SESSIOND_TOKEN_FILE",
    }
  }

  let response: Response
  try {
    response = await fetchImpl(String(new URL("/launch", options.url)), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-korri-sessiond-token": token,
      },
      body: JSON.stringify({ spec }),
    })
  } catch (error) {
    return {
      status: "failed",
      exitCode: 125,
      stderrTail: `sessiond unreachable: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  if (!response.ok) {
    return {
      status: "failed",
      exitCode: response.status === 401 ? 126 : 125,
      stderrTail: `sessiond launch rejected: ${response.status} ${await response.text()}`,
    }
  }

  const body = (await response.json()) as { readonly result?: LaunchResult }
  return body.result ?? { status: "failed", exitCode: 125 }
}

async function spawnViaSessiond(
  spec: LaunchSpec,
  options: SessionLauncherOptions,
  extras: LaunchExtras = {},
): Promise<ManagedLaunchResult> {
  const lifecycle = extras.lifecycle
  const wait = extras.wait
  const fetchImpl = options.fetchImpl ?? fetch
  const token = await resolveSessiondManagedLaunchToken({ ...options, env: {} })
  if (!token) {
    return failedManagedLaunch(
      "host-control-disabled",
      "sessiond launch rejected: missing KORRI_SESSIOND_TOKEN or KORRI_SESSIOND_TOKEN_FILE",
    )
  }

  const statusResult = await probeSessiondManagedLaunchStatus({
    url: options.url,
    token,
    fetchImpl,
    timeoutMs: options.requestTimeoutMs,
  })
  if (statusResult.kind !== "ok") {
    return managedLaunchFailureFromClientFailure(statusResult)
  }

  const status = statusResult.status
  if (
    !status.capabilities.managedLaunch ||
    !status.capabilities.lifecycleEvents ||
    !status.capabilities.perLaunchTermination
  ) {
    return failedManagedLaunch(
      "host-unavailable",
      "sessiond managed launch unsupported by daemon capability status",
    )
  }
  if (
    lifecycle === "session" &&
    status.capabilities.sessionLifecycle !== true
  ) {
    return failedManagedLaunch(
      "host-unavailable",
      "sessiond sessionLifecycle capability unsupported; cannot route lifecycle:'session' launches",
    )
  }
  if (!isLaunchReadyMode(status.mode)) {
    return failedManagedLaunch(
      "session-busy",
      `sessiond is ${status.mode}; launch requires home or idle`,
    )
  }

  const startResult = await requestSessiondManagedLaunchStart(
    { spec, ...(lifecycle ? { lifecycle } : {}), ...(wait ? { wait } : {}) },
    {
      url: options.url,
      token,
      fetchImpl,
      timeoutMs: options.requestTimeoutMs,
    },
  )
  if (startResult.kind !== "ok") {
    return managedLaunchFailureFromClientFailure(startResult)
  }

  const started = startResult.response
  if (started.status === "failed") {
    return failedManagedLaunch(started.failureKind, started.message)
  }

  const observer = observeSessiondManagedLaunchEvents({
    fetchImpl,
    url: options.url,
    token,
    launchId: started.launchId,
    requestTimeoutMs: options.requestTimeoutMs,
  })

  const terminate = () => {
    void terminateSessiondManagedLaunch(
      { launchId: started.launchId },
      {
        url: options.url,
        token,
        fetchImpl,
        timeoutMs: options.requestTimeoutMs,
      },
    )
  }
  const terminateNow = () => {
    void terminateSessiondManagedLaunch(
      { launchId: started.launchId, force: true },
      {
        url: options.url,
        token,
        fetchImpl,
        timeoutMs: options.requestTimeoutMs,
      },
    )
  }

  return {
    status: "started",
    session: {
      id: started.launchId,
      exited: observer.exited,
      ready: observer.ready,
      terminate,
      terminateNow,
    },
    result: observer.result,
  }
}

function managedLaunchFailureFromClientFailure(
  failure: SessiondManagedLaunchClientFailure,
): ManagedLaunchResult {
  if (failure.kind === "missing-token" || failure.kind === "token-rejected") {
    return failedManagedLaunch(
      "host-control-disabled",
      failure.message ??
        "sessiond launch rejected: missing KORRI_SESSIOND_TOKEN or KORRI_SESSIOND_TOKEN_FILE",
    )
  }
  return failedManagedLaunch(
    "host-unavailable",
    failure.message ?? `sessiond unavailable: ${failure.kind}`,
  )
}

function failedManagedLaunch(
  failureKind: LaunchFailureKind,
  stderrTail: string,
  exitCode = launchFailureExitCode(failureKind),
): ManagedLaunchResult {
  return {
    status: "failed",
    result: failedLaunch(failureKind, stderrTail, exitCode),
  }
}

function failedLaunch(
  failureKind: LaunchFailureKind,
  stderrTail: string,
  exitCode = launchFailureExitCode(failureKind),
): Extract<LaunchResult, { readonly status: "failed" }> {
  return { status: "failed", exitCode, failureKind, stderrTail }
}
