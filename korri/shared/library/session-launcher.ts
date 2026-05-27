import { readFile } from "node:fs/promises"
import {
  type Launcher,
  type LaunchFailureKind,
  type LaunchResult,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "./launcher"
import {
  decodeSessiondManagedLaunchEvent,
  decodeSessiondManagedLaunchStartResponse,
  decodeSessiondManagedLaunchStatus,
  isLaunchReadyMode,
  isTerminalReadinessEvent,
  READINESS_GATE_BY_EVENT,
  type ReadinessGate,
  type SessiondManagedLaunchEvent,
  type TerminalReadinessEventType,
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
    async spawn(spec) {
      return spawnViaSessiond(spec, options)
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
): Promise<ManagedLaunchResult> {
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
  if (!isLaunchReadyMode(status.mode)) {
    return failedManagedLaunch(
      "session-busy",
      `sessiond is ${status.mode}; launch requires home or idle`,
    )
  }

  const startResult = await requestSessiondJson(
    fetchImpl,
    options.url,
    token,
    "/managed-launch",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec }),
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

  const observer = observeManagedLaunchEvents({
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

function observeManagedLaunchEvents(options: {
  readonly fetchImpl: SessionLauncherFetch
  readonly url: string
  readonly token: string
  readonly launchId: string
  readonly requestTimeoutMs?: number
}): {
  readonly exited: Promise<{ readonly exitCode: number | null }>
  readonly ready: Promise<SessiondObservedReadiness>
  readonly result: Promise<LaunchResult>
} {
  let resolveExited!: (value: { readonly exitCode: number | null }) => void
  let resolveReady!: (value: SessiondObservedReadiness) => void
  let resolveResult!: (value: LaunchResult) => void
  const exited = new Promise<{ readonly exitCode: number | null }>(resolve => {
    resolveExited = resolve
  })
  const ready = new Promise<SessiondObservedReadiness>(resolve => {
    resolveReady = resolve
  })
  const result = new Promise<LaunchResult>(resolve => {
    resolveResult = resolve
  })
  let childExitObserved = false
  let terminalResult: LaunchResult | undefined
  let resultSettled = false
  let readinessTimeout: ReturnType<typeof setTimeout> | undefined

  const clearReadinessTimeout = () => {
    if (readinessTimeout) clearTimeout(readinessTimeout)
    readinessTimeout = undefined
  }

  const startReadinessTimeout = () => {
    clearReadinessTimeout()
    readinessTimeout = setTimeout(() => {
      settleFailure("sessiond event stream timed out before readiness")
    }, options.requestTimeoutMs ?? DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS)
    if (
      "unref" in readinessTimeout &&
      typeof readinessTimeout.unref === "function"
    ) {
      readinessTimeout.unref()
    }
  }

  const settleFailure = (message: string) => {
    if (!childExitObserved) {
      childExitObserved = true
      resolveExited({ exitCode: null })
    }
    if (!resultSettled) {
      resultSettled = true
      resolveReady(readinessFailed(message))
      clearReadinessTimeout()
      resolveResult(failedLaunch("host-unavailable", message))
    }
  }

  const observe = async () => {
    const response = await fetchWithTimeout(
      options.fetchImpl,
      String(
        new URL(
          `/managed-launch/events?launchId=${encodeURIComponent(options.launchId)}`,
          options.url,
        ),
      ),
      { headers: { "x-korri-sessiond-token": options.token } },
      options.requestTimeoutMs ?? DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS,
    )
    if (!response.ok || !response.body) {
      settleFailure(`sessiond event stream rejected: ${response.status}`)
      return
    }

    for await (const event of readSseEvents(response.body)) {
      if (event.launchId !== options.launchId) continue
      if (event.type === "child-exited") {
        const exitCode = event.terminal?.exitCode ?? null
        terminalResult =
          exitCode === 0
            ? { status: "launched" }
            : failedLaunch(
                event.terminal?.failureKind ?? "command-failed",
                event.terminal?.stderrTail ?? "sessiond child exited",
                exitCode ?? undefined,
              )
        if (!childExitObserved) {
          childExitObserved = true
          resolveExited({ exitCode })
          startReadinessTimeout()
        }
      }
      if (isTerminalReadinessEvent(event.type) && !resultSettled) {
        resultSettled = true
        clearReadinessTimeout()
        resolveReady(readinessOk(event.type))
        resolveResult(terminalResult ?? { status: "launched" })
      }
      if (
        (event.type === "failed" || event.type === "recovering") &&
        !resultSettled
      ) {
        settleFailure(event.message ?? "sessiond managed launch failed")
      }
    }

    if (!resultSettled)
      settleFailure("sessiond event stream ended before readiness")
  }

  void observe().catch(error => {
    settleFailure(
      `sessiond event stream failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  })

  return { exited, ready, result }
}

async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SessiondManagedLaunchEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const read = await reader.read()
    if (read.done) break
    buffer += decoder.decode(read.value, { stream: true })
    const chunks = buffer.split("\n\n")
    buffer = chunks.pop() ?? ""
    for (const chunk of chunks) {
      const data = chunk
        .split("\n")
        .find(line => line.startsWith("data: "))
        ?.slice("data: ".length)
      if (data) yield decodeSessiondManagedLaunchEvent(JSON.parse(data))
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

type SessiondObservedReadiness =
  | ReturnType<typeof readinessOk>
  | ReturnType<typeof readinessFailed>

function readinessGate(
  eventType: TerminalReadinessEventType = "home-ready",
): ReadinessGate {
  return READINESS_GATE_BY_EVENT[eventType]
}

function readinessOk(eventType?: TerminalReadinessEventType) {
  return {
    status: "ok" as const,
    evidence: { gate: readinessGate(eventType) },
  }
}

function readinessFailed(message: string) {
  return {
    status: "failed" as const,
    message,
    evidence: { gate: readinessGate() },
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
