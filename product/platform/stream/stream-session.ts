import type { StreamControlSession } from "@platform/stream-control/stream-control-session"
import {
  createRuntimeRecoverySupervisor,
  type RuntimeRecoveryControlPort,
  type RuntimeRecoveryEvent,
  type RuntimeRecoverySupervisor,
} from "./runtime-recovery-supervisor"
import type { StreamAdaptiveSettings } from "./stream-adaptive-controller"
import {
  createStreamAdaptiveRunner,
  type StreamAdaptiveRunner,
  type StreamAdaptiveRunnerEvent,
} from "./stream-adaptive-runner"
import {
  createStreamHealthMonitor,
  type StreamHealthMonitor,
} from "./stream-health-monitor"
import { streamHealthSamplePortFromSession } from "./stream-health-session"

export interface ActiveStreamControlSessionRecord {
  readonly sessionId: string
  readonly socketPath: string
  readonly close?: () => void
}

export interface ActiveStreamControlSessionRegistry {
  readonly register: (record: ActiveStreamControlSessionRecord) => void
  readonly unregister: (sessionId: string) => void
  readonly current: () => ActiveStreamControlSessionRecord | undefined
}

export interface StreamRuntimeResolution {
  readonly width: number
  readonly height: number
}

export interface StreamRuntimeSettings {
  readonly bitrateKbps?: number
  readonly fps?: number
  readonly resolution?: StreamRuntimeResolution
  readonly baselineResolution?: StreamRuntimeResolution
}

export interface StartStreamRuntimeSessionOptions {
  readonly session: StreamControlSession
  readonly settingsFromState: (state: unknown) => StreamRuntimeSettings
  readonly recoveryPort?: RuntimeRecoveryControlPort
  readonly onRecoveryEvent?: (event: RuntimeRecoveryEvent) => void
  readonly adaptive?: {
    readonly enabled: boolean
    readonly objectiveBias: number
    readonly isStreaming: () => boolean
    readonly onEvent: (event: StreamAdaptiveRunnerEvent) => void
    readonly tickIntervalMs?: number
  }
  readonly nowMs?: () => number
}

export interface StreamRuntimeSession {
  readonly settings: StreamRuntimeSettings
  readonly health: StreamHealthMonitor
  readonly recovery?: RuntimeRecoverySupervisor
  readonly adaptive?: StreamAdaptiveRunner
  readonly close: () => void
}

export function createActiveStreamControlSessionRegistry(): ActiveStreamControlSessionRegistry {
  let active: ActiveStreamControlSessionRecord | undefined
  return {
    register: record => {
      active?.close?.()
      active = record
    },
    unregister: sessionId => {
      if (active?.sessionId !== sessionId) return
      const closing = active
      active = undefined
      closing.close?.()
    },
    current: () => active,
  }
}

export const activeStreamControlSessionRegistry =
  createActiveStreamControlSessionRegistry()

export async function startStreamRuntimeSession(
  options: StartStreamRuntimeSessionOptions,
): Promise<StreamRuntimeSession> {
  const { session } = options
  try {
    await session.hello()
    const state = await session.state()
    await session.subscribe()
    const settings = options.settingsFromState(state)
    const health = createStreamHealthMonitor({
      port: streamHealthSamplePortFromSession(session, {
        nowMs: options.nowMs,
      }),
    })
    const recovery = options.recoveryPort
      ? createRuntimeRecoverySupervisor({
          port: options.recoveryPort,
          baseline: recoveryBaseline(settings),
          onEvent: options.onRecoveryEvent ?? (() => {}),
        })
      : undefined
    const adaptive = startAdaptiveRunner({
      options,
      settings,
      health,
      recovery,
    })
    let closed = false
    return {
      settings,
      health,
      ...(recovery ? { recovery } : {}),
      ...(adaptive ? { adaptive } : {}),
      close: () => {
        if (closed) return
        closed = true
        adaptive?.close()
        recovery?.close()
        health.close()
        session.close()
      },
    }
  } catch (error) {
    session.close()
    throw error
  }
}

function startAdaptiveRunner(input: {
  readonly options: StartStreamRuntimeSessionOptions
  readonly settings: StreamRuntimeSettings
  readonly health: StreamHealthMonitor
  readonly recovery?: RuntimeRecoverySupervisor
}): StreamAdaptiveRunner | undefined {
  const adaptive = input.options.adaptive
  if (!adaptive?.enabled) return undefined
  const initialSettings = adaptiveInitialSettings(input.settings)
  if (!input.recovery || !initialSettings) {
    adaptive.onEvent({ kind: "dormant", reason: "not-ready" })
    return undefined
  }
  return createStreamAdaptiveRunner({
    enabled: adaptive.enabled,
    monitor: input.health,
    recovery: input.recovery,
    initialSettings,
    objectiveBias: adaptive.objectiveBias,
    isStreaming: adaptive.isStreaming,
    onEvent: adaptive.onEvent,
    nowMs: input.options.nowMs,
    ...(adaptive.tickIntervalMs !== undefined
      ? { tickIntervalMs: adaptive.tickIntervalMs }
      : {}),
  })
}

function adaptiveInitialSettings(
  settings: StreamRuntimeSettings,
): StreamAdaptiveSettings | undefined {
  if (
    settings.bitrateKbps === undefined ||
    settings.fps === undefined ||
    settings.resolution === undefined
  ) {
    return undefined
  }
  return {
    bitrateKbps: settings.bitrateKbps,
    fps: settings.fps,
    resolution: settings.resolution,
    baselineResolution: settings.baselineResolution ?? settings.resolution,
  }
}

function recoveryBaseline(settings: StreamRuntimeSettings) {
  return {
    ...(settings.bitrateKbps !== undefined
      ? {
          "runtime.setBitrate": {
            kind: "scalar" as const,
            value: settings.bitrateKbps,
          },
        }
      : {}),
    ...(settings.fps !== undefined
      ? {
          "runtime.setFps": { kind: "scalar" as const, value: settings.fps },
        }
      : {}),
    ...(settings.resolution !== undefined
      ? {
          "runtime.setResolution": {
            kind: "resolution" as const,
            width: settings.resolution.width,
            height: settings.resolution.height,
          },
        }
      : {}),
  }
}
