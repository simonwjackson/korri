import type { StreamControlSession } from "@platform/stream-control/stream-control-session"
import {
  createRuntimeRecoverySupervisor,
  type RuntimeRecoveryControlPort,
  type RuntimeRecoveryEvent,
  type RuntimeRecoverySupervisor,
} from "./runtime-recovery-supervisor"
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
  readonly nowMs?: () => number
}

export interface StreamRuntimeSession {
  readonly settings: StreamRuntimeSettings
  readonly health: StreamHealthMonitor
  readonly recovery?: RuntimeRecoverySupervisor
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
    let closed = false
    return {
      settings,
      health,
      ...(recovery ? { recovery } : {}),
      close: () => {
        if (closed) return
        closed = true
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
