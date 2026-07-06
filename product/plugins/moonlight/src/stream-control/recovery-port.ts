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
}

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
  run: (client: MoonlightControlClient) => Promise<RuntimeRecoveryRequestId | undefined>,
): Promise<RuntimeRecoveryRequestId | undefined> {
  const commandClient = options.commandClient
    ? await options.commandClient()
    : fallbackClient
  try {
    return await run(commandClient)
  } finally {
    if (commandClient !== fallbackClient) commandClient.close()
  }
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
