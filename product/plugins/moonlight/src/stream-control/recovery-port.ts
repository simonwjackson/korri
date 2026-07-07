import type {
  RuntimeRecoveryControlPort,
  RuntimeRecoveryRequestId,
  RuntimeRecoveryResult,
} from "@platform/stream/runtime-recovery-supervisor"
import type { MoonlightControlClient } from "../moonlight-control-client"
import type {
  MoonlightControlCommandMethod,
  MoonlightControlRuntimeSettingsStatus,
  MoonlightControlSuccessResponse,
} from "../moonlight-control-protocol"

export interface MoonlightRecoveryControlPortOptions {
  readonly commandClient?: () => Promise<MoonlightControlClient>
  readonly commandResponseTimeoutMs?: number
}

// Moonlight may be busy draining a congested stream when the emergency command
// arrives. Keep the wait bounded, but long enough for the native loop to accept
// a rescue command instead of aborting it just as it would have applied.
const DEFAULT_FRESH_COMMAND_RESPONSE_TIMEOUT_MS = 5_000

export function moonlightRecoveryControlPortFromClient(
  client: MoonlightControlClient,
  options: MoonlightRecoveryControlPortOptions = {},
): RuntimeRecoveryControlPort {
  return {
    setBitrate: params =>
      withCommandClient(options, client, commandClient =>
        requestIdFromAccepted(
          commandClient.setBitrate({ bitrateKbps: params.bitrateKbps }),
        ),
      ),
    setFps: params =>
      withCommandClient(options, client, commandClient =>
        requestIdFromAccepted(commandClient.setFps({ fps: params.fps })),
      ),
    setResolution: params =>
      withCommandClient(options, client, commandClient =>
        requestIdFromAccepted(
          commandClient.setResolution({
            width: params.width,
            height: params.height,
          }),
        ),
      ),
    onResult: listener =>
      client.onEvent(delivery => {
        const result = recoveryResultFromEvent(delivery.event)
        if (result) listener(result)
      }),
  }
}

async function withCommandClient(
  options: MoonlightRecoveryControlPortOptions,
  fallbackClient: MoonlightControlClient,
  run: (
    client: MoonlightControlClient,
  ) => Promise<RuntimeRecoveryRequestId | undefined>,
): Promise<RuntimeRecoveryRequestId | undefined> {
  const commandClient = options.commandClient
    ? await options.commandClient()
    : fallbackClient
  const isFreshCommandClient = commandClient !== fallbackClient
  const timeoutMs =
    options.commandResponseTimeoutMs ??
    (isFreshCommandClient ? DEFAULT_FRESH_COMMAND_RESPONSE_TIMEOUT_MS : 0)
  let commandClientClosed = false
  const closeFreshCommandClient = () => {
    if (!isFreshCommandClient || commandClientClosed) return
    commandClientClosed = true
    commandClient.close()
  }
  try {
    return await withTimeout(
      run(commandClient),
      timeoutMs,
      closeFreshCommandClient,
    )
  } finally {
    closeFreshCommandClient()
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  if (timeoutMs <= 0) return promise
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout()
      reject(
        new Error(
          `Moonlight runtime command response timed out after ${timeoutMs}ms`,
        ),
      )
    }, timeoutMs)
    timer.unref?.()
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

async function requestIdFromAccepted(
  response: Promise<MoonlightControlSuccessResponse>,
): Promise<RuntimeRecoveryRequestId | undefined> {
  const result = (await response).result
  return isRecord(result) &&
    result._tag === "command.accepted" &&
    isRequestId(result.requestId)
    ? result.requestId
    : undefined
}

function recoveryResultFromEvent(
  event: unknown,
): RuntimeRecoveryResult | undefined {
  if (!isRecord(event) || event.name !== "runtime.commandResult") {
    return undefined
  }
  const { requestId, command, status, reason } = event
  if (
    !isRequestId(requestId) ||
    !isRuntimeCommand(command) ||
    !isStatus(status)
  ) {
    return undefined
  }
  return {
    requestId,
    command,
    status,
    ...(typeof reason === "string" ? { reason } : {}),
  }
}

function isRequestId(value: unknown): value is RuntimeRecoveryRequestId {
  return typeof value === "string" || typeof value === "number"
}

function isRuntimeCommand(
  value: unknown,
): value is MoonlightControlCommandMethod {
  return (
    value === "runtime.requestIdr" ||
    value === "runtime.setBitrate" ||
    value === "runtime.setFps" ||
    value === "runtime.setResolution"
  )
}

function isStatus(
  value: unknown,
): value is MoonlightControlRuntimeSettingsStatus {
  return (
    value === "accepted" ||
    value === "applied" ||
    value === "failed" ||
    value === "invalid" ||
    value === "disabled" ||
    value === "unsupported" ||
    value === "timed-out" ||
    value === "not-streaming" ||
    value === "unauthorized" ||
    value === "conflict"
  )
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
