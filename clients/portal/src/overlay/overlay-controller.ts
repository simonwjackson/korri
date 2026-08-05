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
  let operationEpoch = 0
  let authorityRefreshGeneration = -1
  let accepting = true
  let destroyed = false
  const listeners = new Set<() => void>()
  const commandFlights = new Map<string, Promise<void>>()
  type ValueRequest = {
    readonly value: SurfaceGameplayControlValue
    readonly generation: number
    readonly epoch: number
    readonly resolve: readonly (() => void)[]
  }
  type ValueQueue = { running: boolean; pending?: ValueRequest }
  const valueQueues = new Map<string, ValueQueue>()

  const current = (expectedGeneration: number, expectedEpoch: number) =>
    !destroyed && accepting && expectedGeneration === generation &&
    expectedEpoch === operationEpoch

  const publish = (
    next: SurfaceModel,
    expectedGeneration: number,
    expectedEpoch: number,
  ) => {
    if (!current(expectedGeneration, expectedEpoch)) return false
    currentModel = next
    for (const listener of [...listeners]) listener()
    return true
  }

  const fail = (
    reason: string,
    expectedGeneration: number,
    expectedEpoch: number,
    refreshAuthority: boolean,
  ) => {
    if (!publish(
      unavailableModel(currentModel, reason),
      expectedGeneration,
      expectedEpoch,
    )) return
    if (refreshAuthority && authorityRefreshGeneration !== expectedGeneration) {
      authorityRefreshGeneration = expectedGeneration
      platform.requestAuthorityRefresh()
    }
  }

  const load = async (
    expectedGeneration: number,
    expectedEpoch: number,
    expectedLaunchId: string,
    expectedKorrid: KorridClient,
  ) => {
    const outcome = await expectedKorrid.sessionControls(expectedLaunchId)
    if (!current(expectedGeneration, expectedEpoch)) return
    if (outcome._tag === "Err") {
      fail(
        failureCopy(outcome.payload),
        expectedGeneration,
        expectedEpoch,
        outcome.payload.reason === SessionControlFailureReason.StaleSession ||
          outcome.payload.reason === SessionControlFailureReason.Unavailable,
      )
      return
    }
    if (outcome.payload.launchId !== expectedLaunchId) {
      fail(
        "The gameplay session changed. Resume still works.",
        expectedGeneration,
        expectedEpoch,
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
      expectedEpoch,
    )
  }

  const refresh = async () => {
    if (destroyed || !accepting) return
    const expectedGeneration = generation
    const expectedEpoch = ++operationEpoch
    await load(expectedGeneration, expectedEpoch, launchId, korrid)
  }

  const clearPending = () => {
    operationEpoch += 1
    for (const queue of valueQueues.values()) {
      for (const resolve of queue.pending?.resolve ?? []) resolve()
      queue.pending = undefined
    }
    valueQueues.clear()
  }

  const dismiss = () => {
    if (destroyed || !accepting) return
    accepting = false
    clearPending()
    platform.dismiss()
  }

  const execute = async (
    control: SurfaceGameplayControl,
    value: SurfaceGameplayControlValue | undefined,
    expectedGeneration: number,
    expectedEpoch: number,
    expectedLaunchId: string,
    expectedKorrid: KorridClient,
  ) => {
    const outcome = await expectedKorrid.invokeSessionControl(
      expectedLaunchId,
      control.id,
      generatedValue(value),
    )
    if (destroyed || !accepting || generation !== expectedGeneration) return
    if (outcome._tag === "Err") {
      fail(
        failureCopy(outcome.payload),
        expectedGeneration,
        expectedEpoch,
        outcome.payload.reason === SessionControlFailureReason.StaleSession ||
          outcome.payload.reason === SessionControlFailureReason.Unavailable,
      )
      return
    }

    if (outcome.payload._tag === "PlatformInstruction") {
      const execution = await platform.executeProtectedInstruction(
        outcome.payload.payload,
      )
      if (destroyed || !accepting || generation !== expectedGeneration) return
      if (execution._tag !== "Executed") {
        fail(
          execution.message,
          expectedGeneration,
          expectedEpoch,
          execution._tag === "Rejected",
        )
        return
      }
    }

    if (control.dismissOnSuccess) dismiss()
    else if (current(expectedGeneration, expectedEpoch)) {
      await load(
        expectedGeneration,
        expectedEpoch,
        expectedLaunchId,
        expectedKorrid,
      )
    }
  }

  const runValueQueue = async (controlId: string, queue: ValueQueue) => {
    if (queue.running) return
    queue.running = true
    while (!destroyed && accepting && queue.pending) {
      const request = queue.pending
      queue.pending = undefined
      const control = currentModel.presentation.kind === "gameplay-overlay"
        ? controlFrom(currentModel.presentation, controlId)
        : undefined
      if (control?.enabled && control.id !== "overlay:resume") {
        await execute(
          control,
          request.value,
          request.generation,
          request.epoch,
          launchId,
          korrid,
        )
      }
      for (const resolve of request.resolve) resolve()
    }
    queue.running = false
    if (!queue.pending) valueQueues.delete(controlId)
  }

  const invoke = (
    controlId: string,
    value?: SurfaceGameplayControlValue,
  ): Promise<void> => {
    if (destroyed || !accepting || currentModel.presentation.kind !== "gameplay-overlay") {
      return Promise.resolve()
    }
    const control = controlFrom(currentModel.presentation, controlId)
    if (!control || !control.enabled || control.id === "overlay:resume") {
      return Promise.resolve()
    }
    if (value === undefined) {
      const existing = commandFlights.get(controlId)
      if (existing) return existing
      const expectedGeneration = generation
      const expectedEpoch = ++operationEpoch
      const expectedLaunchId = launchId
      const expectedKorrid = korrid
      const flight = execute(
        control,
        undefined,
        expectedGeneration,
        expectedEpoch,
        expectedLaunchId,
        expectedKorrid,
      ).finally(() => {
        if (commandFlights.get(controlId) === flight) commandFlights.delete(controlId)
      })
      commandFlights.set(controlId, flight)
      return flight
    }

    const expectedGeneration = generation
    const expectedEpoch = ++operationEpoch
    let queue = valueQueues.get(controlId)
    if (!queue) {
      queue = { running: false }
      valueQueues.set(controlId, queue)
    }
    return new Promise(resolve => {
      const prior = queue?.pending
      queue!.pending = {
        value,
        generation: expectedGeneration,
        epoch: expectedEpoch,
        resolve: [...(prior?.resolve ?? []), resolve],
      }
      void runValueQueue(controlId, queue!)
    })
  }

  return {
    model: () => currentModel,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refresh,
    invoke,
    dismiss,
    replaceAuthority(nextLaunchId, nextKorrid) {
      clearPending()
      generation += 1
      authorityRefreshGeneration = -1
      accepting = true
      launchId = nextLaunchId
      korrid = nextKorrid
      currentModel = initialModel()
      for (const listener of [...listeners]) listener()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      accepting = false
      clearPending()
      generation += 1
      listeners.clear()
    },
  }
}
