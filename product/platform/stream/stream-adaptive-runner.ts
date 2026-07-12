import type { StreamBoundaries } from "./stream-adaptive-boundaries"
import type { RuntimeRecoverySupervisor } from "./runtime-recovery-supervisor"
import {
  computeStreamAdaptiveDecision,
  type StreamAdaptiveBindingConstraint,
  type StreamAdaptiveControllerMode,
  type StreamAdaptiveControllerPhase,
  type StreamAdaptivePressure,
  type StreamAdaptiveSettings,
  type StreamAdaptiveTarget,
} from "./stream-adaptive-controller"
import type { StreamHealthMonitor } from "./stream-health-monitor"
import {
  detectEarlyStreamDownshift,
  normalizeHandoffTrigger,
  type StreamHandoffSignal,
} from "./stream-handoff-trigger"
import type { StreamHealthSummary } from "./stream-health"

const SHED_MUTATION_SPACING_MS = 250

type RuntimeStreamCommand =
  | "runtime.setBitrate"
  | "runtime.setFps"
  | "runtime.setResolution"

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
      readonly kind: "early-downshift"
      readonly reasonCode: string
      readonly hintRole: "none" | "corroborating"
      readonly evidence: Readonly<Record<string, unknown>>
    }
  | {
      readonly kind: "decision"
      readonly target: StreamAdaptiveTarget
      readonly pressure: StreamAdaptivePressure
      readonly mode: StreamAdaptiveControllerMode
      readonly bindingConstraint?: StreamAdaptiveBindingConstraint
    }
  | {
      readonly kind: "shed-converging"
      readonly target: StreamAdaptiveTarget
      readonly unresolved: readonly RuntimeStreamCommand[]
    }
  | {
      readonly kind: "dispatched"
      readonly command: RuntimeStreamCommand
      readonly target: StreamAdaptiveTarget
    }
  | {
      readonly kind: "dispatch-failed"
      readonly command: RuntimeStreamCommand
      readonly message: string
    }

export interface StreamAdaptiveRunnerOptions {
  readonly enabled: boolean
  readonly monitor: StreamHealthMonitor
  readonly recovery: RuntimeRecoverySupervisor
  readonly initialSettings: StreamAdaptiveSettings
  readonly observedSettings?: () => StreamAdaptiveSettings | undefined
  readonly objectiveBias: number
  readonly boundaries?: StreamBoundaries | (() => StreamBoundaries | undefined)
  readonly isStreaming: () => boolean
  readonly handoffSignal?: () => StreamHandoffSignal | undefined
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
  let shedConvergence: StreamAdaptiveTarget | undefined
  const interval =
    options.tickIntervalMs !== undefined
      ? setInterval(() => {
          void tick()
        }, options.tickIntervalMs)
      : undefined

  async function tick(): Promise<void> {
    if (closed) return
    if (!options.enabled) {
      shedConvergence = undefined
      options.onEvent({ kind: "dormant", reason: "disabled" })
      return
    }
    if (!options.isStreaming()) {
      shedConvergence = undefined
      options.onEvent({ kind: "dormant", reason: "not-streaming" })
      return
    }
    const hasPending = options.recovery.hasPending()
    const boundaries = effectiveBoundaries(
      currentBoundaries(options.boundaries),
      options.initialSettings,
    )
    if (boundaries.auto === "off") {
      shedConvergence = undefined
      options.onEvent({ kind: "dormant", reason: "within-hysteresis" })
      return
    }
    const summary = options.monitor.latestSummary(nowMs())
    const earlyDownshift =
      summary.freshness === "fresh"
        ? detectEarlyStreamDownshift(
            summary,
            normalizeHandoffTrigger(options.handoffSignal?.()),
          )
        : undefined
    if (earlyDownshift?.kind === "triggered") {
      options.onEvent({
        kind: "early-downshift",
        reasonCode: earlyDownshift.reasonCode,
        hintRole: earlyDownshift.hintRole,
        evidence: earlyDownshift.evidence,
      })
      if (hasPending) {
        options.onEvent({ kind: "dormant", reason: "pending" })
        return
      }
    }
    const decisionSummary =
      earlyDownshift?.kind === "triggered"
        ? summaryForEarlyDownshift(summary)
        : summary
    const current = currentSettings(
      options.recovery,
      options.initialSettings,
      options.observedSettings?.(),
    )
    shedConvergence ??= floorRescueConvergenceTarget(current, boundaries)
    const decision = computeStreamAdaptiveDecision({
      summary: decisionSummary,
      current,
      objectiveBias: options.objectiveBias,
      boundaries,
      phase: phaseForSummary(decisionSummary),
    })

    if (decision.kind === "target" && decision.mode === "shed") {
      shedConvergence = completeShedConvergenceTarget(
        decision.target,
        boundaries,
      )
    }

    let unresolvedShed = shedConvergence
      ? unresolvedShedTarget(
          shedConvergence,
          current,
          boundaries,
          options.initialSettings,
        )
      : undefined
    if (
      shedConvergence &&
      unresolvedShed &&
      stableEnoughToClearShed(decisionSummary) &&
      !isFloorRescueConvergence(shedConvergence, current, boundaries) &&
      !hasShedProgress(
        shedConvergence,
        current,
        boundaries,
        options.initialSettings,
      )
    ) {
      shedConvergence = undefined
      unresolvedShed = undefined
    }
    if (unresolvedShed && hasAnyTarget(unresolvedShed.target)) {
      if (decision.kind !== "target" || decision.mode !== "shed") {
        if (hasPending) {
          options.onEvent({ kind: "dormant", reason: "pending" })
          options.onEvent({
            kind: "shed-converging",
            target: unresolvedShed.target,
            unresolved: unresolvedShed.commands,
          })
          return
        }
        await dispatchTarget(unresolvedShed.target, "shed")
        if (!closed) {
          options.onEvent({
            kind: "shed-converging",
            target: unresolvedShed.target,
            unresolved: unresolvedShed.commands,
          })
        }
        return
      }
    } else {
      shedConvergence = undefined
    }

    if (
      hasPending &&
      (decision.kind !== "target" || decision.mode !== "shed")
    ) {
      options.onEvent({ kind: "dormant", reason: "pending" })
      return
    }

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

    await dispatchTarget(decision.target, decision.mode)
    if (!closed && decision.mode === "shed") {
      options.onEvent({
        kind: "shed-converging",
        target: decision.target,
        unresolved: commandsForTarget(decision.target),
      })
    }
  }

  async function dispatchTarget(
    target: StreamAdaptiveTarget,
    mode: StreamAdaptiveControllerMode,
  ): Promise<void> {
    if (mode === "shed") {
      await dispatchShedTarget(target)
      return
    }
    if (target.bitrateKbps !== undefined) {
      await dispatch("runtime.setBitrate", target, () =>
        options.recovery.setBitrate(target.bitrateKbps as number),
      )
      return
    }
    if (target.fps !== undefined) {
      await dispatch("runtime.setFps", target, () =>
        options.recovery.setFps(target.fps as number),
      )
      return
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

  async function dispatchShedTarget(
    target: StreamAdaptiveTarget,
  ): Promise<void> {
    const steps: (() => Promise<void>)[] = []
    const pushBitrate = () => {
      if (target.bitrateKbps === undefined) return
      steps.push(() =>
        dispatch("runtime.setBitrate", target, () =>
          options.recovery.setBitrate(target.bitrateKbps as number),
        ),
      )
    }

    pushBitrate()
    if (target.fps !== undefined) {
      steps.push(() =>
        dispatch("runtime.setFps", target, () =>
          options.recovery.setFps(target.fps as number),
        ),
      )
    }
    if (target.resolution !== undefined) {
      steps.push(() =>
        dispatch("runtime.setResolution", target, () =>
          options.recovery.setResolution(
            target.resolution?.width as number,
            target.resolution?.height as number,
          ),
        ),
      )
    }
    if (target.bitrateKbps !== undefined && steps.length > 1) {
      pushBitrate()
    }

    for (let index = 0; index < steps.length; index += 1) {
      if (closed) return
      void steps[index]?.()
      if (!closed && index < steps.length - 1) {
        await sleep(SHED_MUTATION_SPACING_MS)
      }
    }
  }

  async function dispatch(
    command: RuntimeStreamCommand,
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

function phaseForSummary(summary: {
  readonly sampleCount: number
}): StreamAdaptiveControllerPhase {
  return summary.sampleCount < 3 ? "establishing" : "steady"
}

function summaryForEarlyDownshift(
  summary: StreamHealthSummary,
): StreamHealthSummary {
  return {
    ...summary,
    rttMs: {
      ...summary.rttMs,
      mean: Math.max(summary.rttMs.mean ?? 0, 110),
      trend: "rising",
    },
    bitrateDeliveryRatio: Math.min(summary.bitrateDeliveryRatio ?? 1, 0.24),
    fpsDeliveryRatio: Math.min(summary.fpsDeliveryRatio ?? 1, 0.34),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function stableEnoughToClearShed(summary: StreamHealthSummary): boolean {
  return (
    summary.freshness === "fresh" &&
    (summary.bitrateDeliveryRatio ?? 1) >= 0.9 &&
    (summary.fpsDeliveryRatio ?? 1) >= 0.9 &&
    (summary.rttMs.mean ?? 0) <= 80 &&
    (summary.lossFraction.mean ?? 0) <= 0.01 &&
    (summary.queueDepth.mean ?? 0) <= 2 &&
    (summary.frameDropFraction ?? 0) <= 0.02
  )
}

function floorRescueConvergenceTarget(
  current: StreamAdaptiveSettings,
  boundaries: StreamBoundaries,
): StreamAdaptiveTarget | undefined {
  const floor = boundaries.levers.resolution?.floor
  if (floor === undefined) return undefined
  if (
    current.resolution.width > floor.width ||
    current.resolution.height > floor.height
  ) {
    return undefined
  }
  const target: { bitrateKbps?: number; fps?: number } = {}
  const bitrate = explicitBitrateFloor(boundaries)
  if (bitrate !== undefined && current.bitrateKbps > bitrate) {
    target.bitrateKbps = bitrate
  }
  const fps = explicitFpsFloor(boundaries)
  if (fps !== undefined && current.fps > fps) target.fps = fps
  return hasAnyTarget(target) ? target : undefined
}

function completeShedConvergenceTarget(
  target: StreamAdaptiveTarget,
  boundaries: StreamBoundaries,
): StreamAdaptiveTarget {
  const bitrate = explicitBitrateFloor(boundaries)
  const fps = explicitFpsFloor(boundaries)
  const resolution = explicitResolutionFloor(boundaries)
  return {
    ...target,
    ...(target.bitrateKbps === undefined && bitrate !== undefined
      ? { bitrateKbps: bitrate }
      : {}),
    ...(target.fps === undefined && fps !== undefined ? { fps } : {}),
    ...(target.resolution === undefined && resolution !== undefined
      ? { resolution }
      : {}),
  }
}

function isFloorRescueConvergence(
  target: StreamAdaptiveTarget,
  current: StreamAdaptiveSettings,
  boundaries: StreamBoundaries,
): boolean {
  const resolution = explicitResolutionFloor(boundaries)
  if (
    resolution === undefined ||
    current.resolution.width > resolution.width ||
    current.resolution.height > resolution.height
  ) {
    return false
  }
  const bitrate = explicitBitrateFloor(boundaries)
  const fps = explicitFpsFloor(boundaries)
  return (
    (bitrate !== undefined && target.bitrateKbps === bitrate) ||
    (fps !== undefined && target.fps === fps)
  )
}

function explicitBitrateFloor(
  boundaries: StreamBoundaries,
): number | undefined {
  const lever = boundaries.levers.bitrate
  if (lever?.pinned) return undefined
  return lever?.floor
}

function explicitFpsFloor(boundaries: StreamBoundaries): number | undefined {
  const lever = boundaries.levers.fps
  if (lever?.pinned) return undefined
  return lever?.floor
}

function explicitResolutionFloor(
  boundaries: StreamBoundaries,
): StreamAdaptiveTarget["resolution"] | undefined {
  const lever = boundaries.levers.resolution
  if (lever?.pinned) return undefined
  return lever?.floor
}

function unresolvedShedTarget(
  target: StreamAdaptiveTarget,
  current: StreamAdaptiveSettings,
  boundaries: StreamBoundaries,
  initial: StreamAdaptiveSettings,
): {
  readonly target: StreamAdaptiveTarget
  readonly commands: readonly RuntimeStreamCommand[]
} {
  const next: {
    bitrateKbps?: number
    fps?: number
    resolution?: StreamAdaptiveTarget["resolution"]
  } = {}
  const bitrate = normalizedShedBitrate(target, boundaries)
  if (bitrate !== undefined && current.bitrateKbps > bitrate) {
    next.bitrateKbps = bitrate
  }
  const fps = normalizedShedFps(target, boundaries)
  if (fps !== undefined && current.fps > fps) next.fps = fps
  const resolution = normalizedShedResolution(target, boundaries, initial)
  if (
    resolution !== undefined &&
    (current.resolution.width > resolution.width ||
      current.resolution.height > resolution.height)
  ) {
    next.resolution = resolution
  }
  return { target: next, commands: commandsForTarget(next) }
}

function hasShedProgress(
  target: StreamAdaptiveTarget,
  current: StreamAdaptiveSettings,
  boundaries: StreamBoundaries,
  initial: StreamAdaptiveSettings,
): boolean {
  const bitrate = normalizedShedBitrate(target, boundaries)
  if (bitrate !== undefined && current.bitrateKbps <= bitrate) return true
  const fps = normalizedShedFps(target, boundaries)
  if (fps !== undefined && current.fps <= fps) return true
  const resolution = normalizedShedResolution(target, boundaries, initial)
  return (
    resolution !== undefined &&
    current.resolution.width <= resolution.width &&
    current.resolution.height <= resolution.height
  )
}

function normalizedShedBitrate(
  target: StreamAdaptiveTarget,
  boundaries: StreamBoundaries,
): number | undefined {
  if (target.bitrateKbps === undefined || boundaries.levers.bitrate?.pinned) {
    return undefined
  }
  return clamp(
    target.bitrateKbps,
    boundaries.levers.bitrate?.floor ?? target.bitrateKbps,
    boundaries.levers.bitrate?.ceiling ?? target.bitrateKbps,
  )
}

function normalizedShedFps(
  target: StreamAdaptiveTarget,
  boundaries: StreamBoundaries,
): number | undefined {
  if (target.fps === undefined || boundaries.levers.fps?.pinned) {
    return undefined
  }
  const ceiling = boundaries.levers.fps?.ceiling ?? target.fps
  const floor = Math.min(
    ceiling,
    Math.max(
      boundaries.levers.fps?.floor ?? target.fps,
      boundaries.outcomes.minDeliveredFps ?? target.fps,
    ),
  )
  return clamp(target.fps, floor, ceiling)
}

function normalizedShedResolution(
  target: StreamAdaptiveTarget,
  boundaries: StreamBoundaries,
  initial: StreamAdaptiveSettings,
): StreamAdaptiveTarget["resolution"] | undefined {
  if (target.resolution === undefined || boundaries.levers.resolution?.pinned) {
    return undefined
  }
  const floor = boundaries.levers.resolution?.floor
  const ceiling =
    boundaries.levers.resolution?.ceiling ?? initial.baselineResolution
  const aspect =
    initial.baselineResolution.height / initial.baselineResolution.width
  const minWidth = Math.max(
    floor?.width ?? target.resolution.width,
    floor?.height === undefined
      ? target.resolution.width
      : floor.height / aspect,
  )
  const maxWidth = Math.min(ceiling.width, ceiling.height / aspect)
  const width = even(
    clamp(target.resolution.width, minWidth, Math.max(minWidth, maxWidth)),
  )
  return { width, height: even(width * aspect) }
}

function commandsForTarget(
  target: StreamAdaptiveTarget,
): RuntimeStreamCommand[] {
  const commands: RuntimeStreamCommand[] = []
  if (target.bitrateKbps !== undefined) commands.push("runtime.setBitrate")
  if (target.fps !== undefined) commands.push("runtime.setFps")
  if (target.resolution !== undefined) commands.push("runtime.setResolution")
  return commands
}

function hasAnyTarget(target: StreamAdaptiveTarget): boolean {
  return (
    target.bitrateKbps !== undefined ||
    target.fps !== undefined ||
    target.resolution !== undefined
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
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
        ceiling: boundaries?.levers.bitrate?.ceiling ?? initial.bitrateKbps,
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
  observed: StreamAdaptiveSettings | undefined,
): StreamAdaptiveSettings {
  const knownGood = recovery.knownGood()
  const bitrate = knownGood["runtime.setBitrate"]
  const fps = knownGood["runtime.setFps"]
  const resolution = knownGood["runtime.setResolution"]
  return {
    ...initial,
    bitrateKbps:
      observed?.bitrateKbps ??
      (bitrate?.kind === "scalar" ? bitrate.value : initial.bitrateKbps),
    fps: observed?.fps ?? (fps?.kind === "scalar" ? fps.value : initial.fps),
    resolution:
      observed?.resolution ??
      (resolution?.kind === "resolution"
        ? { width: resolution.width, height: resolution.height }
        : initial.resolution),
  }
}
