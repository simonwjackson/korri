import {
  type StartStreamRuntimeSessionOptions,
  type StreamRuntimeSession,
  type StreamRuntimeSettings,
  startStreamRuntimeSession,
} from "@platform/stream/stream-session"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "../moonlight-control-client"
import { moonlightRecoveryControlPortFromClient } from "./recovery-port"
import { moonlightSessionFromClient } from "./session"

export interface MoonlightStreamRuntimeOptions {
  readonly socketPath: string
  readonly connect?: (input: {
    readonly socketPath: string
  }) => Promise<MoonlightControlClient>
  readonly adaptive?: StartStreamRuntimeSessionOptions["adaptive"]
  readonly onRecoveryEvent?: StartStreamRuntimeSessionOptions["onRecoveryEvent"]
  readonly nowMs?: () => number
}

export async function startMoonlightStreamRuntimeSession(
  options: MoonlightStreamRuntimeOptions,
): Promise<StreamRuntimeSession> {
  const connect = options.connect ?? connectMoonlightControl
  const client = await connect({ socketPath: options.socketPath })
  const healthPollClient = await connect({ socketPath: options.socketPath })
  try {
    const runtime = await startStreamRuntimeSession({
      session: moonlightSessionFromClient(client),
      pollHealthState: () => healthPollClient.state(),
      recoveryPort: moonlightRecoveryControlPortFromClient(client),
      settingsFromState: moonlightRuntimeSettingsFromState,
      ...(options.adaptive ? { adaptive: options.adaptive } : {}),
      ...(options.onRecoveryEvent
        ? { onRecoveryEvent: options.onRecoveryEvent }
        : {}),
      ...(options.nowMs ? { nowMs: options.nowMs } : {}),
    })
    return {
      ...runtime,
      close: () => {
        runtime.close()
        healthPollClient.close()
      },
    }
  } catch (error) {
    healthPollClient.close()
    client.close()
    throw error
  }
}

export function moonlightRuntimeSettingsFromState(
  state: unknown,
): StreamRuntimeSettings {
  const result = recordField(state, "result") ?? asRecord(state)
  const runtimeSettings = recordField(result, "runtimeSettings")
  const streamQuality = recordField(result, "streamQuality")
  const resolution = firstResolution(
    recordField(runtimeSettings, "appliedResolution"),
    streamQuality,
  )
  return {
    ...(firstNumber(
      runtimeSettings?.appliedBitrateKbps,
      streamQuality?.bitrateKbps,
    ) !== undefined
      ? {
          bitrateKbps: firstNumber(
            runtimeSettings?.appliedBitrateKbps,
            streamQuality?.bitrateKbps,
          ),
        }
      : {}),
    ...(firstNumber(runtimeSettings?.appliedFps, streamQuality?.fps) !==
    undefined
      ? { fps: firstNumber(runtimeSettings?.appliedFps, streamQuality?.fps) }
      : {}),
    ...(resolution ? { resolution, baselineResolution: resolution } : {}),
  }
}

function firstResolution(
  ...candidates: readonly (Record<string, unknown> | undefined)[]
): { readonly width: number; readonly height: number } | undefined {
  for (const candidate of candidates) {
    const width = firstNumber(candidate?.width)
    const height = firstNumber(candidate?.height)
    if (width !== undefined && height !== undefined) return { width, height }
  }
  return undefined
}

function firstNumber(...values: readonly unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return undefined
}

function recordField(
  input: unknown,
  key: string,
): Record<string, unknown> | undefined {
  const record = asRecord(input)
  return asRecord(record?.[key])
}

function asRecord(input: unknown): Record<string, unknown> | undefined {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined
}
