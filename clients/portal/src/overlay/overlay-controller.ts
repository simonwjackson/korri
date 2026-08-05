import {
  SessionControlFailureReason,
  type PlatformInstruction,
  type SessionControlFailure,
  type SessionControlValue,
} from "@contracts/generated/korrid"
import type {
  SurfaceGameplayControl,
  SurfaceGameplayControlValue,
  SurfaceGameplayOverlayPresentation,
  SurfaceModel,
} from "@contracts/surface/korri-surface"
import type { KorridClient } from "../korrid/client"
import { gameplayOverlayPresentationFrom } from "./overlay-model"

export type ProtectedInstructionExecution =
  | { readonly _tag: "Executed" }
  | { readonly _tag: "Unavailable"; readonly message: string }
  | { readonly _tag: "Rejected"; readonly message: string }

export interface OverlayPlatform {
  dismiss(): void
  requestAuthorityRefresh(): void
  executeProtectedInstruction(
    instruction: PlatformInstruction,
  ): Promise<ProtectedInstructionExecution>
}

export interface OverlayController {
  model(): SurfaceModel
  subscribe(listener: () => void): () => void
  refresh(): Promise<void>
  invoke(controlId: string, value?: SurfaceGameplayControlValue): Promise<void>
  dismiss(): void
  replaceAuthority(launchId: string, korrid: KorridClient): void
  destroy(): void
}

const RESUME_ONLY: SurfaceGameplayOverlayPresentation = {
  kind: "gameplay-overlay",
  controls: [
    {
      id: "overlay:resume",
      label: "Resume",
      enabled: true,
      destructive: false,
      dismissOnSuccess: true,
      interaction: { kind: "command" },
    },
  ],
  groups: [],
}

function initialModel(): SurfaceModel {
  return {
    presentation: RESUME_ONLY,
    catalog: { _tag: "Empty" },
    status: { _tag: "Busy", kicker: "Loading controls…" },
    actions: [],
    settings: [],
    settingsStatus: { _tag: "Idle" },
  }
}

const CALM_UNAVAILABLE =
  "Gameplay controls are unavailable right now. Resume still works."

function failureCopy(failure: SessionControlFailure): string {
  switch (failure.reason) {
    case SessionControlFailureReason.StaleSession:
      return "The gameplay session changed. Resume still works."
    case SessionControlFailureReason.Disabled:
      return failure.message || "That control is unavailable right now."
    case SessionControlFailureReason.InvalidValue:
      return "That setting could not be applied."
    case SessionControlFailureReason.UnknownControl:
      return "That gameplay control is no longer available."
    case SessionControlFailureReason.Unavailable:
      return CALM_UNAVAILABLE
  }
}

function disableControl(
  control: SurfaceGameplayControl,
  reason: string,
): SurfaceGameplayControl {
  return {
    ...control,
    enabled: false,
    disabledReason: reason,
  }
}

function unavailableModel(
  model: SurfaceModel,
  reason: string,
): SurfaceModel {
  const presentation = model.presentation.kind === "gameplay-overlay"
    ? {
        ...model.presentation,
        groups: model.presentation.groups.map(group => ({
          ...group,
          controls: group.controls.map(control => disableControl(control, reason)),
        })),
      }
    : RESUME_ONLY
  return {
    ...model,
    presentation,
    status: {
      _tag: "Problem",
      kicker: "Controls unavailable",
      reason,
      canRetry: true,
    },
  }
}

function generatedValue(
  value: SurfaceGameplayControlValue | undefined,
): SessionControlValue | undefined {
  if (value === undefined) return undefined
  return value
}

function controlFrom(
  presentation: SurfaceGameplayOverlayPresentation,
  controlId: string,
): SurfaceGameplayControl | undefined {
  return [...presentation.controls, ...presentation.groups.flatMap(group => group.controls)]
    .find(control => control.id === controlId)
}

export function createOverlayController({
  launchId: initialLaunchId,
  korrid: initialKorrid,
  platform,
}: {
  readonly launchId: string
  readonly korrid: KorridClient
  readonly platform: OverlayPlatform
}): OverlayController {
  let launchId = initialLaunchId
  let korrid = initialKorrid
  let currentModel = initialModel()
  let generation = 0
  let destroyed = false
  const listeners = new Set<() => void>()

  const publish = (next: SurfaceModel, expectedGeneration: number) => {
    if (destroyed || expectedGeneration !== generation) return false
    currentModel = next
    for (const listener of [...listeners]) listener()
    return true
  }

  const fail = (
    reason: string,
    expectedGeneration: number,
    refreshAuthority: boolean,
  ) => {
    if (!publish(unavailableModel(currentModel, reason), expectedGeneration)) return
    if (refreshAuthority) platform.requestAuthorityRefresh()
  }

  const refresh = async () => {
    const expectedGeneration = generation
    const expectedLaunchId = launchId
    const outcome = await korrid.sessionControls(expectedLaunchId)
    if (destroyed || generation !== expectedGeneration) return
    if (outcome._tag === "Err") {
      fail(
        failureCopy(outcome.payload),
        expectedGeneration,
        outcome.payload.reason === SessionControlFailureReason.StaleSession ||
          outcome.payload.reason === SessionControlFailureReason.Unavailable,
      )
      return
    }
    if (outcome.payload.launchId !== expectedLaunchId) {
      fail(
        "The gameplay session changed. Resume still works.",
        expectedGeneration,
        true,
      )
      return
    }
    publish(
      {
        ...currentModel,
        presentation: gameplayOverlayPresentationFrom(outcome.payload),
        status: { _tag: "Browsing" },
      },
      expectedGeneration,
    )
  }

  const invoke = async (
    controlId: string,
    value?: SurfaceGameplayControlValue,
  ) => {
    if (currentModel.presentation.kind !== "gameplay-overlay") return
    const control = controlFrom(currentModel.presentation, controlId)
    if (!control || !control.enabled || control.id === "overlay:resume") return
    const expectedGeneration = generation
    const expectedLaunchId = launchId
    const outcome = await korrid.invokeSessionControl(
      expectedLaunchId,
      controlId,
      generatedValue(value),
    )
    if (destroyed || generation !== expectedGeneration) return
    if (outcome._tag === "Err") {
      fail(
        failureCopy(outcome.payload),
        expectedGeneration,
        outcome.payload.reason === SessionControlFailureReason.StaleSession ||
          outcome.payload.reason === SessionControlFailureReason.Unavailable,
      )
      return
    }

    if (outcome.payload._tag === "PlatformInstruction") {
      const execution = await platform.executeProtectedInstruction(
        outcome.payload.payload,
      )
      if (destroyed || generation !== expectedGeneration) return
      if (execution._tag !== "Executed") {
        fail(execution.message, expectedGeneration, execution._tag === "Rejected")
        return
      }
    }

    if (control.dismissOnSuccess) platform.dismiss()
    else await refresh()
  }

  return {
    model: () => currentModel,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refresh,
    invoke,
    dismiss: () => platform.dismiss(),
    replaceAuthority(nextLaunchId, nextKorrid) {
      generation += 1
      launchId = nextLaunchId
      korrid = nextKorrid
      currentModel = initialModel()
      for (const listener of [...listeners]) listener()
    },
    destroy() {
      destroyed = true
      generation += 1
      listeners.clear()
    },
  }
}
