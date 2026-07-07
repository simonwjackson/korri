import type { PluginRegistry } from "@platform/plugin/registry"
import {
  connectStreamControlSession,
  type StreamControlSession,
} from "@platform/stream-control/stream-control-session"
import { createFirstPartyPluginState } from "@product/plugin-host/state"
import {
  type CurrentStreamSurfaceGeometry,
  readCurrentStreamSurfaceGeometry,
} from "@product/services/device/game-stream-fullscreen"
import type {
  SwayCommandRunner,
  SwayWindowSelector,
} from "@product/services/device/sessiond-sway"
import { discoverSwaySocketEnv } from "@product/services/device/sessiond-sway-socket"
import {
  startTouchBoundsCoordinator,
  type TouchBoundsCoordinatorHandle,
} from "@product/services/device/touch-bounds-coordinator"
import type {
  ContentModeFacts,
  TouchBoundsScalingPolicy,
} from "@product/services/device/touch-bounds-geometry"

export type MoonlightTouchBoundsRuntimeHandle = TouchBoundsCoordinatorHandle

export interface MoonlightTouchBoundsRuntimeOptions {
  readonly socketPath: string
  readonly enabled?: boolean
  readonly env?: Record<string, string | undefined>
  readonly pluginRegistry?: PluginRegistry
  readonly moonlight?: StreamControlSession
  readonly runner?: SwayCommandRunner
  readonly selector?: SwayWindowSelector
  readonly readGeometry?: () => Promise<CurrentStreamSurfaceGeometry>
  readonly readContentMode?: () => Promise<ContentModeFacts | undefined>
  readonly scalingPolicy?: TouchBoundsScalingPolicy
  readonly pollMs?: number | false
}

export async function startMoonlightTouchBoundsRuntime(
  options: MoonlightTouchBoundsRuntimeOptions,
): Promise<MoonlightTouchBoundsRuntimeHandle | undefined> {
  if (!touchBoundsRuntimeEnabled(options)) return undefined

  const ownsSession = options.moonlight === undefined
  const moonlight =
    options.moonlight ??
    (await connectStreamControlSession(
      options.pluginRegistry ??
        createFirstPartyPluginState({ mode: "interactive" }).registry,
      { socketPath: options.socketPath },
    ))

  try {
    const coordinator = await startTouchBoundsCoordinator({
      moonlight,
      readGeometry:
        options.readGeometry ?? liveStreamSurfaceGeometryReader(options),
      readContentMode:
        options.readContentMode ?? liveMoonlightContentModeReader(moonlight),
      scalingPolicy:
        options.scalingPolicy ?? touchBoundsScalingPolicyFromEnv(options.env),
      pollMs: options.pollMs,
    })

    return {
      ...coordinator,
      close: async () => {
        await coordinator.close()
        if (ownsSession) moonlight.close()
      },
    }
  } catch (error) {
    if (ownsSession) moonlight.close()
    throw error
  }
}

function touchBoundsRuntimeEnabled(
  options: Pick<MoonlightTouchBoundsRuntimeOptions, "enabled" | "env">,
): boolean {
  if (options.enabled !== undefined) return options.enabled
  const env = options.env ?? globalThis.Bun?.env ?? process.env
  const raw = env.KORRI_MOONLIGHT_TOUCH_BOUNDS_ENABLED?.trim().toLowerCase()
  return raw !== "0" && raw !== "false"
}

function liveStreamSurfaceGeometryReader(
  options: Pick<
    MoonlightTouchBoundsRuntimeOptions,
    "runner" | "selector" | "env"
  >,
): () => Promise<CurrentStreamSurfaceGeometry> {
  const runner = options.runner ?? createSwayCommandRunner(options.env)
  const selector = options.selector ?? streamSurfaceSelectorFromEnv(options.env)
  return () => readCurrentStreamSurfaceGeometry({ runner, selector })
}

function liveMoonlightContentModeReader(
  moonlight: StreamControlSession,
): () => Promise<ContentModeFacts | undefined> {
  return async () => contentModeFromState(await moonlight.state())
}

function contentModeFromState(state: unknown): ContentModeFacts | undefined {
  const result = recordField(state, "result") ?? asRecord(state)
  const streamQuality = recordField(result, "streamQuality")
  const runtimeSettings = recordField(result, "runtimeSettings")
  return firstContentMode(
    recordField(runtimeSettings, "appliedResolution"),
    streamQuality,
  )
}

function firstContentMode(
  ...candidates: readonly (Record<string, unknown> | undefined)[]
): ContentModeFacts | undefined {
  for (const candidate of candidates) {
    const width = firstNumber(candidate?.width)
    const height = firstNumber(candidate?.height)
    if (width !== undefined && height !== undefined) return { width, height }
  }
  return undefined
}

function touchBoundsScalingPolicyFromEnv(
  env: Record<string, string | undefined> = globalThis.Bun?.env ?? process.env,
): TouchBoundsScalingPolicy {
  const raw = env.KORRI_MOONLIGHT_TOUCH_BOUNDS_SCALING?.trim().toLowerCase()
  if (raw === "fit-letterbox") return { _tag: "fitLetterbox" }
  if (raw === "unknown") return { _tag: "unknown" }
  return { _tag: "stretchFill" }
}

function streamSurfaceSelectorFromEnv(
  env: Record<string, string | undefined> = globalThis.Bun?.env ?? process.env,
): SwayWindowSelector {
  const appIds = envList(env, "KORRI_STREAM_SURFACE_APP_IDS") ?? ["gamescope"]
  return {
    appIds,
    appIdPrefixes: envList(env, "KORRI_STREAM_SURFACE_APP_ID_PREFIXES") ?? [],
    titles: envList(env, "KORRI_STREAM_SURFACE_TITLES") ?? [],
    classes: envList(env, "KORRI_STREAM_SURFACE_CLASSES") ?? [],
    allowAnonymous:
      envFlag(env, "KORRI_STREAM_SURFACE_ALLOW_ANONYMOUS") ??
      appIds.includes("gamescope"),
  }
}

function createSwayCommandRunner(
  env: Record<string, string | undefined> = globalThis.Bun?.env ?? process.env,
): SwayCommandRunner {
  return {
    run: async args => {
      const proc = Bun.spawn(["swaymsg", ...args], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, ...env, ...discoverSwaySocketEnv(env) },
      })
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        throw new Error(stderr || stdout || `swaymsg exited ${exitCode}`)
      }
      return stdout
    },
  }
}

function envFlag(
  env: Record<string, string | undefined>,
  name: string,
): boolean | undefined {
  const raw = env[name]?.trim().toLowerCase()
  if (!raw) return undefined
  if (["1", "true", "yes", "on"].includes(raw)) return true
  if (["0", "false", "no", "off"].includes(raw)) return false
  return undefined
}

function envList(
  env: Record<string, string | undefined>,
  name: string,
): readonly string[] | undefined {
  const raw = env[name]
  if (!raw?.trim()) return undefined
  return raw
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
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
