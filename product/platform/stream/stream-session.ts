import type { StreamControlSession } from "@platform/stream-control/stream-control-session"
import type { StreamBoundaries } from "./stream-adaptive-boundaries"
import {
  createRuntimeRecoverySupervisor,
  type RuntimeRecoveryControlPort,
  type RuntimeRecoveryEvent,
  type RuntimeRecoverySupervisor,
} from "./runtime-recovery-supervisor"
import {
  computeStreamAdaptiveDecision,
  type StreamAdaptiveDecision,
  type StreamAdaptiveSettings,
} from "./stream-adaptive-controller"
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
  readonly adaptiveControl?: () => StreamAdaptiveRuntimeControl | undefined
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
    readonly boundaries?: StreamBoundaries
    readonly isStreaming: () => boolean
    readonly onEvent: (event: StreamAdaptiveRunnerEvent) => void
    readonly tickIntervalMs?: number
  }
  readonly nowMs?: () => number
}

export interface StreamAdaptiveControlSnapshot {
  readonly enabled: boolean
  readonly boundaries?: StreamBoundaries
  readonly lastEvent?: StreamAdaptiveRunnerEvent
}

export interface StreamAdaptiveRuntimeControl {
  readonly snapshot: () => StreamAdaptiveControlSnapshot
  readonly setBoundaries: (boundaries: StreamBoundaries | undefined) => void
  readonly dryRun: (boundaries?: StreamBoundaries) => StreamAdaptiveDecision
}

export interface StreamRuntimeSession {
  readonly settings: StreamRuntimeSettings
  readonly health: StreamHealthMonitor
  readonly recovery?: RuntimeRecoverySupervisor
  readonly adaptive?: StreamAdaptiveRunner
  readonly adaptiveControl?: StreamAdaptiveRuntimeControl
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
    const adaptiveRuntime = startAdaptiveRunner({
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
      ...(adaptiveRuntime ? { adaptive: adaptiveRuntime.runner } : {}),
      ...(adaptiveRuntime ? { adaptiveControl: adaptiveRuntime.control } : {}),
      close: () => {
        if (closed) return
        closed = true
        adaptiveRuntime?.runner.close()
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
}):
  | {
      readonly runner: StreamAdaptiveRunner
      readonly control: StreamAdaptiveRuntimeControl
    }
  | undefined {
  const adaptive = input.options.adaptive
  if (!adaptive?.enabled) return undefined
  const initialSettings = adaptiveInitialSettings(input.settings)
  if (!input.recovery || !initialSettings) {
    adaptive.onEvent({ kind: "dormant", reason: "not-ready" })
    return undefined
  }

  let boundaries = adaptive.boundaries
  let lastEvent: StreamAdaptiveRunnerEvent | undefined
  const onEvent = (event: StreamAdaptiveRunnerEvent) => {
    lastEvent = event
    adaptive.onEvent(event)
  }
  const runner = createStreamAdaptiveRunner({
    enabled: adaptive.enabled,
    monitor: input.health,
    recovery: input.recovery,
    initialSettings,
    objectiveBias: adaptive.objectiveBias,
    boundaries: () => boundaries,
    isStreaming: adaptive.isStreaming,
    onEvent,
    nowMs: input.options.nowMs,
    ...(adaptive.tickIntervalMs !== undefined
      ? { tickIntervalMs: adaptive.tickIntervalMs }
      : {}),
  })
  const control: StreamAdaptiveRuntimeControl = {
    snapshot: () => ({
      enabled: adaptive.enabled,
      ...(boundaries ? { boundaries } : {}),
      ...(lastEvent ? { lastEvent } : {}),
    }),
    setBoundaries: next => {
      boundaries = next
    },
    dryRun: previewBoundaries =>
      computeStreamAdaptiveDecision({
        summary: input.health.latestSummary((input.options.nowMs ?? Date.now)()),
        current: adaptiveCurrentSettings(input.recovery, initialSettings),
        objectiveBias: adaptive.objectiveBias,
        boundaries: previewBoundaries ?? boundaries,
      }),
  }
  return { runner, control }
}

function adaptiveCurrentSettings(
  recovery: RuntimeRecoverySupervisor,
  initial: StreamAdaptiveSettings,
): StreamAdaptiveSettings {
  const knownGood = recovery.knownGood()
  const bitrate = knownGood["runtime.setBitrate"]
  const fps = knownGood["runtime.setFps"]
  const resolution = knownGood["runtime.setResolution"]
  return {
    ...initial,
    bitrateKbps:
      bitrate?.kind === "scalar" ? bitrate.value : initial.bitrateKbps,
    fps: fps?.kind === "scalar" ? fps.value : initial.fps,
    resolution:
      resolution?.kind === "resolution"
        ? { width: resolution.width, height: resolution.height }
        : initial.resolution,
  }
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
