import type { StreamBoundaries } from "./stream-adaptive-boundaries"
import type { RuntimeRecoverySupervisor } from "./runtime-recovery-supervisor"
import {
  computeStreamAdaptiveDecision,
  type StreamAdaptiveBindingConstraint,
  type StreamAdaptiveControllerMode,
  type StreamAdaptivePressure,
  type StreamAdaptiveSettings,
  type StreamAdaptiveTarget,
} from "./stream-adaptive-controller"
import type { StreamHealthMonitor } from "./stream-health-monitor"

export type StreamAdaptiveRunnerDormantReason =
  | "disabled"
  | "pending"
  | "not-streaming"
  | "stale"
  | "no-data"
  | "not-ready"
  | "within-hysteresis"

export type StreamAdaptiveRunnerEvent =
  | {
      readonly kind: "dormant"
      readonly reason: StreamAdaptiveRunnerDormantReason
    }
  | {
      readonly kind: "decision"
      readonly target: StreamAdaptiveTarget
      readonly pressure: StreamAdaptivePressure
      readonly mode: StreamAdaptiveControllerMode
      readonly bindingConstraint?: StreamAdaptiveBindingConstraint
    }
  | {
      readonly kind: "dispatched"
      readonly command:
        | "runtime.setBitrate"
        | "runtime.setFps"
        | "runtime.setResolution"
      readonly target: StreamAdaptiveTarget
    }
  | {
      readonly kind: "dispatch-failed"
      readonly command:
        | "runtime.setBitrate"
        | "runtime.setFps"
        | "runtime.setResolution"
      readonly message: string
    }

export interface StreamAdaptiveRunnerOptions {
  readonly enabled: boolean
  readonly monitor: StreamHealthMonitor
  readonly recovery: RuntimeRecoverySupervisor
  readonly initialSettings: StreamAdaptiveSettings
  readonly objectiveBias: number
  readonly boundaries?: StreamBoundaries | (() => StreamBoundaries | undefined)
  readonly isStreaming: () => boolean
  readonly onEvent: (event: StreamAdaptiveRunnerEvent) => void
  readonly nowMs?: () => number
  readonly tickIntervalMs?: number
}

export interface StreamAdaptiveRunner {
  readonly tick: () => Promise<void>
  readonly close: () => void
}

export function createStreamAdaptiveRunner(
  options: StreamAdaptiveRunnerOptions,
): StreamAdaptiveRunner {
  const nowMs = options.nowMs ?? (() => Date.now())
  let closed = false
  const interval =
    options.tickIntervalMs !== undefined
      ? setInterval(() => {
          void tick()
        }, options.tickIntervalMs)
      : undefined

  async function tick(): Promise<void> {
    if (closed) return
    if (!options.enabled) {
      options.onEvent({ kind: "dormant", reason: "disabled" })
      return
    }
    if (!options.isStreaming()) {
      options.onEvent({ kind: "dormant", reason: "not-streaming" })
      return
    }
    if (options.recovery.hasPending()) {
      options.onEvent({ kind: "dormant", reason: "pending" })
      return
    }

    const summary = options.monitor.latestSummary(nowMs())
    const decision = computeStreamAdaptiveDecision({
      summary,
      current: currentSettings(options.recovery, options.initialSettings),
      objectiveBias: options.objectiveBias,
      boundaries: effectiveBoundaries(
        currentBoundaries(options.boundaries),
        options.initialSettings,
      ),
    })

    if (decision.kind === "dormant") {
      options.onEvent({ kind: "dormant", reason: decision.reason })
      return
    }

    if (!closed) {
      options.onEvent({
        kind: "decision",
        target: decision.target,
        pressure: decision.pressure,
        mode: decision.mode,
        bindingConstraint: decision.bindingConstraint,
      })
    }

    await dispatchTarget(decision.target)
  }

  async function dispatchTarget(target: StreamAdaptiveTarget): Promise<void> {
    if (target.bitrateKbps !== undefined) {
      await dispatch("runtime.setBitrate", target, () =>
        options.recovery.setBitrate(target.bitrateKbps as number),
      )
    }
    if (target.fps !== undefined) {
      await dispatch("runtime.setFps", target, () =>
        options.recovery.setFps(target.fps as number),
      )
    }
    if (target.resolution !== undefined) {
      await dispatch("runtime.setResolution", target, () =>
        options.recovery.setResolution(
          target.resolution?.width as number,
          target.resolution?.height as number,
        ),
      )
    }
  }

  async function dispatch(
    command: "runtime.setBitrate" | "runtime.setFps" | "runtime.setResolution",
    target: StreamAdaptiveTarget,
    run: () => Promise<void>,
  ): Promise<void> {
    try {
      await run()
      if (!closed) options.onEvent({ kind: "dispatched", command, target })
    } catch (error) {
      if (!closed) {
        options.onEvent({
          kind: "dispatch-failed",
          command,
          message: describeDispatchError(error),
        })
      }
    }
  }

  return {
    tick,
    close: () => {
      if (closed) return
      closed = true
      if (interval !== undefined) clearInterval(interval)
    },
  }
}

function describeDispatchError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    const encoded = JSON.stringify(error)
    if (encoded && encoded !== "{}") return encoded
  } catch {
    // Fall through to String for non-serializable values.
  }
  return String(error)
}

function currentBoundaries(
  boundaries: StreamAdaptiveRunnerOptions["boundaries"],
): StreamBoundaries | undefined {
  return typeof boundaries === "function" ? boundaries() : boundaries
}

function effectiveBoundaries(
  boundaries: StreamBoundaries | undefined,
  initial: StreamAdaptiveSettings,
): StreamBoundaries {
  return {
    ...boundaries,
    levers: {
      ...(boundaries?.levers ?? {}),
      bitrate: {
        ...(boundaries?.levers.bitrate ?? {}),
        ceiling:
          boundaries?.levers.bitrate?.ceiling ?? initial.bitrateKbps,
      },
      fps: {
        ...(boundaries?.levers.fps ?? {}),
        ceiling: boundaries?.levers.fps?.ceiling ?? initial.fps,
      },
      resolution: {
        ...(boundaries?.levers.resolution ?? {}),
        ceiling:
          boundaries?.levers.resolution?.ceiling ?? initial.baselineResolution,
      },
    },
    outcomes: boundaries?.outcomes ?? {},
  }
}

function currentSettings(
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
