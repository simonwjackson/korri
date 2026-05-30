import { readFile } from "node:fs/promises"
import {
  type LaunchExtras,
  type Launcher,
  type LaunchFailureKind,
  type LaunchResult,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "./launcher"
import { observeSessiondManagedLaunchEvents } from "./sessiond-managed-launch-event-observer"
import {
  decodeSessiondManagedLaunchStartResponse,
  decodeSessiondManagedLaunchStatus,
  isLaunchReadyMode,
} from "./sessiond-managed-launch-protocol"

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

const DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS = 10_000

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
  const token = await resolveToken(options)
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

export async function spawnViaSessiond(
  spec: LaunchSpec,
  options: SessionLauncherOptions,
  extras: LaunchExtras = {},
): Promise<ManagedLaunchResult> {
  const lifecycle = extras.lifecycle
  const wait = extras.wait
  const fetchImpl = options.fetchImpl ?? fetch
  const token = await resolveToken(options)
  if (!token) {
    return failedManagedLaunch(
      "host-control-disabled",
      "sessiond launch rejected: missing KORRI_SESSIOND_TOKEN or KORRI_SESSIOND_TOKEN_FILE",
    )
  }

  const statusResult = await requestSessiondJson(
    fetchImpl,
    options.url,
    token,
    "/managed-launch/status",
  )
  if (statusResult.status === "failed") return statusResult.result

  let status: ReturnType<typeof decodeSessiondManagedLaunchStatus>
  try {
    status = decodeSessiondManagedLaunchStatus(statusResult.value)
  } catch (error) {
    return failedManagedLaunch(
      "host-unavailable",
      `sessiond status payload invalid: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
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

  const startBody: Record<string, unknown> = { spec }
  if (lifecycle) startBody.lifecycle = lifecycle
  if (wait) startBody.wait = wait
  const startResult = await requestSessiondJson(
    fetchImpl,
    options.url,
    token,
    "/managed-launch",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(startBody),
    },
  )
  if (startResult.status === "failed") return startResult.result

  let started: ReturnType<typeof decodeSessiondManagedLaunchStartResponse>
  try {
    started = decodeSessiondManagedLaunchStartResponse(startResult.value)
  } catch (error) {
    return failedManagedLaunch(
      "host-unavailable",
      `sessiond start payload invalid: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
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
    void terminateManagedLaunch(fetchImpl, options.url, token, started.launchId)
  }
  const terminateNow = () => {
    void terminateManagedLaunch(
      fetchImpl,
      options.url,
      token,
      started.launchId,
      {
        force: true,
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

async function requestSessiondJson(
  fetchImpl: SessionLauncherFetch,
  url: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<
  | { readonly status: "ok"; readonly value: unknown }
  | { readonly status: "failed"; readonly result: ManagedLaunchResult }
> {
  let response: Response
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      String(new URL(path, url)),
      {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          "x-korri-sessiond-token": token,
        },
      },
      DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS,
    )
  } catch (error) {
    return {
      status: "failed",
      result: failedManagedLaunch(
        "host-unavailable",
        `sessiond unreachable: ${error instanceof Error ? error.message : String(error)}`,
      ),
    }
  }

  if (!response.ok) {
    const text = await readResponseTextWithTimeout(
      response,
      DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS,
    ).catch(
      error =>
        `unreadable response body: ${error instanceof Error ? error.message : String(error)}`,
    )
    return {
      status: "failed",
      result: failedManagedLaunch(
        response.status === 401 ? "host-control-disabled" : "host-unavailable",
        `sessiond request rejected: ${response.status} ${text}`,
      ),
    }
  }

  try {
    return {
      status: "ok",
      value: await readResponseJsonWithTimeout(
        response,
        DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS,
      ),
    }
  } catch (error) {
    return {
      status: "failed",
      result: failedManagedLaunch(
        "host-unavailable",
        `sessiond response payload invalid: ${error instanceof Error ? error.message : String(error)}`,
      ),
    }
  }
}

async function terminateManagedLaunch(
  fetchImpl: SessionLauncherFetch,
  url: string,
  token: string,
  launchId: string,
  options: { readonly force?: boolean } = {},
): Promise<void> {
  try {
    await fetchWithTimeout(
      fetchImpl,
      String(new URL("/managed-launch/terminate", url)),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-korri-sessiond-token": token,
        },
        body: JSON.stringify({
          launchId,
          ...(options.force ? { force: true } : {}),
        }),
      },
      DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS,
    )
  } catch {
    // Termination is best-effort; lifecycle observation reports final outcome.
  }
}

async function fetchWithTimeout(
  fetchImpl: SessionLauncherFetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  return await promiseWithTimeout(
    fetchImpl(input, { ...init, signal: controller.signal }),
    timeoutMs,
    () => controller.abort(),
  )
}

async function readResponseTextWithTimeout(
  response: Response,
  timeoutMs: number,
): Promise<string> {
  return await promiseWithTimeout(response.text(), timeoutMs)
}

async function readResponseJsonWithTimeout(
  response: Response,
  timeoutMs: number,
): Promise<unknown> {
  return await promiseWithTimeout(response.json(), timeoutMs)
}

async function promiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => {
      onTimeout?.()
      reject(new Error(`sessiond request timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    if (timeout && "unref" in timeout && typeof timeout.unref === "function") {
      timeout.unref()
    }
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
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

async function resolveToken(
  options: SessionLauncherOptions,
): Promise<string | undefined> {
  if (options.token?.trim()) return options.token.trim()
  if (!options.tokenFile?.trim()) return undefined

  try {
    const raw = await readFile(options.tokenFile, "utf8")
    return raw.trim() || undefined
  } catch {
    return undefined
  }
}
