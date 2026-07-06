import type { StreamBoundaries } from "./stream-adaptive-boundaries"
import {
  computeStreamAdaptiveDecision,
  type StreamAdaptiveControllerPhase,
  type StreamAdaptiveDecision,
  type StreamAdaptiveSettings,
} from "./stream-adaptive-controller"
import type { StreamHealthSummary } from "./stream-health"

export interface StreamAdaptiveScenarioStep {
  readonly summary: StreamHealthSummary
  readonly boundaries?: StreamBoundaries
  readonly phase?: StreamAdaptiveControllerPhase
}

export interface StreamAdaptiveScenarioInput {
  readonly initial: StreamAdaptiveSettings
  readonly objectiveBias: number
  readonly boundaries?: StreamBoundaries
  readonly phase?: StreamAdaptiveControllerPhase
  readonly steps: readonly StreamAdaptiveScenarioStep[]
}

export interface StreamAdaptiveScenarioResult {
  readonly index: number
  readonly decision: StreamAdaptiveDecision
  readonly settings: StreamAdaptiveSettings
  readonly mode?: "establish" | "fine-tune" | "shed"
}

export function runStreamAdaptiveScenario(
  input: StreamAdaptiveScenarioInput,
): readonly StreamAdaptiveScenarioResult[] {
  let settings = input.initial
  return input.steps.map((step, index) => {
    const decision = computeStreamAdaptiveDecision({
      summary: step.summary,
      current: settings,
      objectiveBias: input.objectiveBias,
      boundaries: step.boundaries ?? input.boundaries,
      phase: step.phase ?? input.phase,
    })
    if (decision.kind === "target") {
      settings = {
        ...settings,
        bitrateKbps: decision.target.bitrateKbps ?? settings.bitrateKbps,
        fps: decision.target.fps ?? settings.fps,
        resolution: decision.target.resolution ?? settings.resolution,
      }
    }
    return {
      index,
      decision,
      settings,
      mode: decision.kind === "target" ? decision.mode : undefined,
    }
  })
}
