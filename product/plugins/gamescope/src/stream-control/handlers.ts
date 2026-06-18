import { type ProviderId, pluginRecordId } from "@platform/plugin"
import {
  closeClient,
  errorMessage,
} from "@platform/stream-control/runtime-support"
import {
  connectGamescopeControl,
  type GamescopeControlClient,
  type GamescopeScalingFilter,
  normalizeGamescopeState,
  readGamescopeScalingFilter,
} from "../runtime-control"
import { gamescopeStreamControlCapabilities } from "./control-surface"

export interface GamescopeModePayload {
  readonly width: number
  readonly height: number
}

export interface GamescopeFpsPayload {
  readonly fps: number
}

export interface GamescopeFilterPayload {
  readonly filter: GamescopeScalingFilter
}

export interface GamescopeSharpnessPayload {
  readonly sharpness: number
}

export type GamescopeCommandClient = Pick<
  GamescopeControlClient,
  "requestCommand" | "setFilter" | "setMode" | "setSharpness"
>

export const setGamescopeMode = (
  client: GamescopeCommandClient,
  payload: GamescopeModePayload,
) => client.setMode(payload)

export const setGamescopeFps = (
  client: GamescopeCommandClient,
  payload: GamescopeFpsPayload,
) => client.requestCommand("fps.set", payload)

export const setGamescopeFilter = (
  client: GamescopeCommandClient,
  payload: GamescopeFilterPayload,
) => client.setFilter(payload)

export const setGamescopeSharpness = (
  client: GamescopeCommandClient,
  payload: GamescopeSharpnessPayload,
) => client.setSharpness(payload)

export interface GamescopeStreamControlDescribeInput {
  readonly socketPath?: string
}

export interface GamescopeStreamControlDescribeOutput {
  readonly config: { readonly enabled: boolean }
  readonly controls: ReturnType<typeof gamescopeStreamControlCapabilities>
  readonly state: unknown
}

export interface GamescopeStreamControlApplyInput {
  readonly action: string
  readonly payload: Record<string, unknown>
  readonly socketPath?: string
}

export function describeGamescopeStreamControl(input: {
  readonly provider: ProviderId
  readonly socketPath?: string
  readonly connect?: (options: {
    readonly socketPath: string
  }) => Promise<GamescopeControlClient>
}): Promise<GamescopeStreamControlDescribeOutput> {
  const socketPath = input.socketPath ?? gamescopeSocketPathFromEnv()
  const enabled = Boolean(socketPath)
  return readPluginState({ ...input, socketPath }).then(state => ({
    config: { enabled },
    controls: gamescopeStreamControlCapabilities({
      provider: input.provider,
      enabled,
    }),
    state,
  }))
}

export async function applyGamescopeStreamControl(input: {
  readonly provider: ProviderId
  readonly action: string
  readonly payload: Record<string, unknown>
  readonly socketPath?: string
  readonly connect?: (options: {
    readonly socketPath: string
  }) => Promise<GamescopeControlClient>
}): Promise<unknown> {
  const socketPath = input.socketPath ?? gamescopeSocketPathFromEnv()
  if (!socketPath) throw new Error("runtime-control socket disabled")
  let client: GamescopeControlClient | undefined
  try {
    client = await (input.connect ?? connectGamescopeControl)({ socketPath })
    const action = localAction(input.provider, input.action)
    if (action === "resolution.set") {
      return await setGamescopeMode(client, readResolution(input.payload))
    }
    if (action === "fps.set") {
      return await setGamescopeFps(client, readFps(input.payload))
    }
    if (action === "filter.set") {
      return await setGamescopeFilter(client, readFilter(input.payload))
    }
    if (action === "sharpness.set") {
      return await setGamescopeSharpness(client, readSharpness(input.payload))
    }
    throw new Error(`unsupported action: ${input.action}`)
  } finally {
    closeClient(client)
  }
}

async function readPluginState(input: {
  readonly socketPath?: string
  readonly connect?: (options: {
    readonly socketPath: string
  }) => Promise<GamescopeControlClient>
}) {
  if (!input.socketPath) return { status: "disabled" as const }
  let client: GamescopeControlClient | undefined
  try {
    client = await (input.connect ?? connectGamescopeControl)({
      socketPath: input.socketPath,
    })
    return {
      status: "ok" as const,
      readback: normalizeGamescopeState(await client.state()),
    }
  } catch (error) {
    return { status: "error" as const, error: errorMessage(error) }
  } finally {
    closeClient(client)
  }
}

function localAction(provider: ProviderId, action: string): string {
  const prefix = `${provider}/`
  return action.startsWith(prefix) ? action.slice(prefix.length) : action
}

function readResolution(
  payload: Record<string, unknown>,
): GamescopeModePayload {
  const width = numberField(payload, "width")
  const height = numberField(payload, "height")
  if (!isResolutionDimension(width) || !isResolutionDimension(height)) {
    throw new Error("width and height between 1 and 16384 (integer) required")
  }
  return { width, height }
}

function readFps(payload: Record<string, unknown>): GamescopeFpsPayload {
  const fps = numberField(payload, "fps")
  if (fps === undefined || !Number.isInteger(fps) || fps < 0 || fps > 240) {
    throw new Error("fps between 0 and 240 (integer) required")
  }
  return { fps }
}

function readFilter(payload: Record<string, unknown>): GamescopeFilterPayload {
  const filter = readGamescopeScalingFilter(payload.filter)
  if (!filter) throw new Error("valid filter required")
  return { filter }
}

function readSharpness(
  payload: Record<string, unknown>,
): GamescopeSharpnessPayload {
  const sharpness = numberField(payload, "sharpness")
  if (sharpness === undefined || sharpness < 0 || sharpness > 20) {
    throw new Error("sharpness between 0 and 20 required")
  }
  return { sharpness }
}

function numberField(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isResolutionDimension(value: number | undefined): value is number {
  return (
    value !== undefined &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 16_384
  )
}

function gamescopeSocketPathFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env.KORRI_GAMESCOPE_CONTROL_SOCKET
}

export function gamescopeAction(provider: ProviderId, id: string): string {
  return pluginRecordId(provider, id)
}
