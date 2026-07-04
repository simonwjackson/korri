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

export function moonlightRecoveryControlPortFromClient(
  client: MoonlightControlClient,
): RuntimeRecoveryControlPort {
  return {
    setBitrate: async params =>
      requestIdFromAccepted(
        await client.setBitrate({ bitrateKbps: params.bitrateKbps }),
      ),
    setFps: async params =>
      requestIdFromAccepted(await client.setFps({ fps: params.fps })),
    setResolution: async params =>
      requestIdFromAccepted(
        await client.setResolution({
          width: params.width,
          height: params.height,
        }),
      ),
    onResult: listener =>
      client.onEvent(delivery => {
        const result = recoveryResultFromEvent(delivery.event)
        if (result) listener(result)
      }),
  }
}

function requestIdFromAccepted(
  response: MoonlightControlSuccessResponse,
): RuntimeRecoveryRequestId | undefined {
  const result = response.result
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
  const { requestId, command, status } = event
  if (
    !isRequestId(requestId) ||
    !isRuntimeCommand(command) ||
    !isStatus(status)
  ) {
    return undefined
  }
  return { requestId, command, status }
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
