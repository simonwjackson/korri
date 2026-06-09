import {
  type LaunchFailureKind,
  type LaunchResult,
  launchFailureExitCode,
} from "./launcher"
import {
  decodeSessiondManagedLaunchEvent,
  isTerminalReadinessEvent,
  READINESS_GATE_BY_EVENT,
  type ReadinessGate,
  type SessiondManagedLaunchEvent,
  type TerminalReadinessEventType,
} from "./sessiond-managed-launch-protocol"

export type SessiondManagedLaunchEventFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>

export interface SessiondManagedLaunchEventObserverOptions {
  readonly fetchImpl: SessiondManagedLaunchEventFetch
  readonly url?: string
  readonly socketPath?: string
  readonly launchId: string
  readonly requestTimeoutMs?: number
}

export type SessiondObservedReadiness =
  | ReturnType<typeof readinessOk>
  | ReturnType<typeof readinessFailed>

export interface SessiondManagedLaunchEventObservation {
  readonly exited: Promise<{ readonly exitCode: number | null }>
  readonly ready: Promise<SessiondObservedReadiness>
  readonly result: Promise<LaunchResult>
}

const DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS = 10_000

// The stream is expected to be long-lived for the duration of a launch;
// closure before a terminal event indicates an HTTP-layer hiccup (idle
// timeout, transient socket reset) rather than a launch failure. Retry
// a small number of times before declaring the session unobservable.
const DEFAULT_EVENT_STREAM_MAX_ATTEMPTS = 5
const DEFAULT_EVENT_STREAM_RECONNECT_DELAY_MS = 200

export function observeSessiondManagedLaunchEvents(
  options: SessiondManagedLaunchEventObserverOptions,
): SessiondManagedLaunchEventObservation {
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
  let cachedLauncherTerminal: SessiondManagedLaunchEvent["terminal"] | undefined

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

  const settleExited = (
    terminal: SessiondManagedLaunchEvent["terminal"] | undefined,
    defaultFailureMessage: string,
  ) => {
    const exitCode = terminal?.exitCode ?? null
    terminalResult =
      exitCode === 0
        ? { status: "launched" }
        : failedLaunch(
            terminal?.failureKind ?? "command-failed",
            terminal?.stderrTail ?? defaultFailureMessage,
            exitCode ?? undefined,
          )
    if (!childExitObserved) {
      childExitObserved = true
      resolveExited({ exitCode })
      startReadinessTimeout()
    }
  }

  const consumeEventStream = async (): Promise<boolean> => {
    const response = await fetchWithTimeout(
      options.fetchImpl,
      String(
        new URL(
          `/managed-launch/events?launchId=${encodeURIComponent(options.launchId)}`,
          options.url ?? "http://korri-sessiond",
        ),
      ),
      { ...(options.socketPath ? { unix: options.socketPath } : {}) },
      options.requestTimeoutMs ?? DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS,
    )
    if (!response.ok || !response.body) {
      throw new Error(`sessiond event stream rejected: ${response.status}`)
    }

    for await (const event of readSseEvents(response.body)) {
      if (event.launchId !== options.launchId) continue
      if (event.type === "child-exited") {
        settleExited(event.terminal, "sessiond child exited")
      }
      if (event.type === "launcher-exited") {
        cachedLauncherTerminal = event.terminal
      }
      if (event.type === "wait-monitor-exited") {
        settleExited(event.terminal, "sessiond wait monitor exited")
      }
      if (
        event.type === "terminated" &&
        !childExitObserved &&
        cachedLauncherTerminal !== undefined
      ) {
        settleExited(cachedLauncherTerminal, "sessiond session terminated")
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

    return resultSettled
  }

  const observe = async () => {
    let attempts = 0
    let lastError: string | undefined
    while (!resultSettled && attempts < DEFAULT_EVENT_STREAM_MAX_ATTEMPTS) {
      attempts += 1
      try {
        const settled = await consumeEventStream()
        if (settled) return
        lastError = "event stream ended before readiness"
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }
      if (resultSettled) return
      if (attempts < DEFAULT_EVENT_STREAM_MAX_ATTEMPTS) {
        await new Promise<void>(resolve =>
          setTimeout(resolve, DEFAULT_EVENT_STREAM_RECONNECT_DELAY_MS),
        )
      }
    }
    if (!resultSettled) {
      settleFailure(
        `sessiond event stream unavailable after ${attempts} attempts: ${lastError ?? "unknown"}`,
      )
    }
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

async function fetchWithTimeout(
  fetchImpl: SessiondManagedLaunchEventFetch,
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

function failedLaunch(
  failureKind: LaunchFailureKind,
  stderrTail: string,
  exitCode = launchFailureExitCode(failureKind),
): Extract<LaunchResult, { readonly status: "failed" }> {
  return { status: "failed", exitCode, failureKind, stderrTail }
}
