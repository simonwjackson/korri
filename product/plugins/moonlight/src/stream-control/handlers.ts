import type { ProviderId } from "@platform/plugin"
import {
  FPS_STEPS,
  RESOLUTION_STEPS,
  type StreamControlCapability,
} from "@platform/stream-control/control-contract"
import { STREAM_CONTROL_LIMITS } from "@platform/stream-control/limits"
import {
  closeClient,
  errorMessage,
} from "@platform/stream-control/runtime-support"
import { rpcResult } from "@platform/stream-control/state-normalizer"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "../moonlight-control-client"

/**
 * Moonlight's stream-control contribution: bitrate/fps/resolution as
 * provider-tagged generic controls (mirroring gamescope). The engine reaches
 * these only through stream-control.describe/apply dispatch; the socket, wire
 * protocol, and readback normalization are plugin-internal.
 */

/**
 * Readback keys match the control local ids (`bitrate`, `fps`, `resolution`)
 * so the platform's generic plugin-readback path can resolve them from the
 * provider-qualified control readback ids.
 */
export interface MoonlightStateReadback {
  readonly bitrate: number | null
  readonly fps: number | null
  readonly resolution: { readonly width: number; readonly height: number } | null
}

type Connect = (options: {
  readonly socketPath: string
}) => Promise<MoonlightControlClient>

export interface MoonlightStreamControlDescribeInput {
  readonly socketPath?: string
}

export interface MoonlightStreamControlApplyInput {
  readonly action: string
  readonly payload: Record<string, unknown>
  readonly socketPath?: string
}

export function moonlightStreamControlCapabilities(input: {
  readonly provider: ProviderId
  readonly enabled: boolean
}): readonly StreamControlCapability[] {
  const support = input.enabled
    ? { status: "supported" as const, unavailableReason: null }
    : {
        status: "unsupported" as const,
        unavailableReason: "moonlight stream control disabled",
      }
  return [
    {
      id: `${input.provider}/bitrate`,
      label: "Bitrate",
      subsystem: "moonlight",
      provider: input.provider,
      access: "read-write",
      action: `${input.provider}/bitrate.set`,
      readback: `${input.provider}/bitrate`,
      value: {
        kind: "range",
        min: STREAM_CONTROL_LIMITS.bitrateKbps.min,
        max: 150_000,
        step: 500,
      },
      ...support,
    },
    {
      id: `${input.provider}/fps`,
      label: "Moonlight FPS",
      subsystem: "moonlight",
      provider: input.provider,
      access: "read-write",
      action: `${input.provider}/fps.set`,
      readback: `${input.provider}/fps`,
      value: { kind: "steps", values: FPS_STEPS },
      ...support,
    },
    {
      id: `${input.provider}/resolution`,
      label: "Moonlight resolution",
      subsystem: "moonlight",
      provider: input.provider,
      access: "read-write",
      action: `${input.provider}/resolution.set`,
      readback: `${input.provider}/resolution`,
      value: { kind: "resolutions", values: RESOLUTION_STEPS },
      ...support,
    },
  ]
}

export async function describeMoonlightStreamControl(input: {
  readonly provider: ProviderId
  readonly socketPath?: string
  readonly connect?: Connect
}): Promise<{
  readonly config: { readonly enabled: boolean }
  readonly controls: readonly StreamControlCapability[]
  readonly state: unknown
}> {
  const socketPath = input.socketPath ?? moonlightSocketPathFromEnv()
  const enabled = Boolean(socketPath)
  return {
    config: { enabled },
    controls: moonlightStreamControlCapabilities({
      provider: input.provider,
      enabled,
    }),
    state: await readMoonlightState({ ...input, socketPath }),
  }
}

export async function applyMoonlightStreamControl(input: {
  readonly provider: ProviderId
  readonly action: string
  readonly payload: Record<string, unknown>
  readonly socketPath?: string
  readonly connect?: Connect
}): Promise<unknown> {
  const socketPath = input.socketPath ?? moonlightSocketPathFromEnv()
  if (!socketPath) throw new Error("moonlight socket disabled")
  let client: MoonlightControlClient | undefined
  try {
    client = await (input.connect ?? connectMoonlightControl)({ socketPath })
    const action = localAction(input.provider, input.action)
    if (action === "bitrate.set") {
      return await client.setBitrate({
        bitrateKbps: positiveNumberField(input.payload, "bitrateKbps"),
      })
    }
    if (action === "fps.set") {
      return await client.setFps({
        fps: positiveNumberField(input.payload, "fps"),
      })
    }
    if (action === "resolution.set") {
      return await client.setResolution({
        width: positiveNumberField(input.payload, "width"),
        height: positiveNumberField(input.payload, "height"),
      })
    }
    throw new Error(`unsupported action: ${input.action}`)
  } finally {
    closeClient(client)
  }
}

export function normalizeMoonlightState(
  snapshot: unknown,
): MoonlightStateReadback {
  const result = rpcResult(snapshot)
  const runtimeSettings = recordField(result, "runtimeSettings")
  const streamQuality = recordField(result, "streamQuality")
  return {
    bitrate:
      firstNumber(
        runtimeSettings?.appliedBitrateKbps,
        streamQuality?.bitrateKbps,
      ) ?? null,
    fps: firstNumber(runtimeSettings?.appliedFps, streamQuality?.fps) ?? null,
    resolution: resolutionReadback(runtimeSettings, streamQuality),
  }
}

async function readMoonlightState(input: {
  readonly socketPath?: string
  readonly connect?: Connect
}): Promise<unknown> {
  if (!input.socketPath) return { status: "disabled" as const }
  let client: MoonlightControlClient | undefined
  try {
    client = await (input.connect ?? connectMoonlightControl)({
      socketPath: input.socketPath,
    })
    return {
      status: "ok" as const,
      readback: normalizeMoonlightState(await client.state()),
    }
  } catch (error) {
    return { status: "error" as const, error: errorMessage(error) }
  } finally {
    closeClient(client)
  }
}

function moonlightSocketPathFromEnv(): string | undefined {
  const socketPath = process.env.MOONLIGHT_LOCAL_CONTROL_SOCKET?.trim()
  return socketPath ? socketPath : undefined
}

function localAction(provider: ProviderId, action: string): string {
  const prefix = `${provider}/`
  return action.startsWith(prefix) ? action.slice(prefix.length) : action
}

function positiveNumberField(
  payload: Record<string, unknown>,
  key: string,
): number {
  const value = payload[key]
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} positive number required`)
  }
  return value
}

function resolutionReadback(
  runtimeSettings: Record<string, unknown> | undefined,
  streamQuality: Record<string, unknown> | undefined,
) {
  const runtimeResolution = recordField(runtimeSettings, "appliedResolution")
  const width = firstNumber(runtimeResolution?.width, streamQuality?.width)
  const height = firstNumber(runtimeResolution?.height, streamQuality?.height)
  return width === undefined || height === undefined ? null : { width, height }
}

function recordField(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key]
  return isRecord(value) ? value : undefined
}

function firstNumber(...values: readonly unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
