import { type RemapBinding } from "./bindings"
import { parseControlRef, type RemapControllerRef } from "./control-ref"
import {
  pressTarget,
  releaseTarget,
  type RemapSink,
  validateSinkCapabilities,
} from "./sinks"

export interface CreateRemapEngineOptions {
  readonly bindings: readonly RemapBinding[]
  readonly sink: RemapSink
}

export interface RemapEngine {
  readonly setSource: (sourceRef: string, pressed: boolean) => void
  readonly releaseAll: () => void
}

export function createRemapEngine(
  options: CreateRemapEngineOptions,
): RemapEngine {
  validateSinkCapabilities(
    options.sink,
    options.bindings.flatMap(binding => [...binding.targets]),
  )

  const bindingsBySource = new Map<string, readonly RemapBinding[]>()
  for (const binding of options.bindings) {
    bindingsBySource.set(binding.source.ref, [
      ...(bindingsBySource.get(binding.source.ref) ?? []),
      binding,
    ])
  }

  const activeSources = new Set<string>()
  const targetRefs = new Map(
    options.bindings.flatMap(binding =>
      binding.targets.map(target => [target.ref, target] as const),
    ),
  )
  const activeTargetSources = new Map<string, Set<string>>()

  const setSource = (sourceRef: string, pressed: boolean): void => {
    const source = parseControlRef(sourceRef)
    if (source.kind !== "controller") {
      throw new Error(`Remap source must be a controller ref: ${sourceRef}`)
    }
    if (pressed) {
      releaseActiveStickPeerDirections(source)
      pressSource(source.ref)
    } else {
      releaseSource(source.ref)
    }
  }

  const pressSource = (sourceRef: string): void => {
    if (activeSources.has(sourceRef)) return
    activeSources.add(sourceRef)
    for (const binding of bindingsBySource.get(sourceRef) ?? []) {
      for (const target of binding.targets) {
        const sources = activeTargetSources.get(target.ref) ?? new Set<string>()
        const wasInactive = sources.size === 0
        sources.add(sourceRef)
        activeTargetSources.set(target.ref, sources)
        if (wasInactive) pressTarget(options.sink, target)
      }
    }
  }

  const releaseSource = (sourceRef: string): void => {
    if (!activeSources.delete(sourceRef)) return
    for (const binding of bindingsBySource.get(sourceRef) ?? []) {
      for (const target of binding.targets) {
        const sources = activeTargetSources.get(target.ref)
        if (!sources) continue
        sources.delete(sourceRef)
        if (sources.size === 0) {
          activeTargetSources.delete(target.ref)
          releaseTarget(options.sink, target)
        }
      }
    }
  }

  const releaseActiveStickPeerDirections = (
    source: RemapControllerRef,
  ): void => {
    const group = stickGroup(source)
    if (!group) return
    for (const activeSource of [...activeSources]) {
      if (activeSource === source.ref) continue
      const active = parseControlRef(activeSource)
      if (active.kind !== "controller") continue
      if (stickGroup(active) === group) releaseSource(activeSource)
    }
  }

  const releaseAll = (): void => {
    activeSources.clear()
    for (const [targetRef, target] of targetRefs) {
      if (!activeTargetSources.has(targetRef)) continue
      activeTargetSources.delete(targetRef)
      releaseTarget(options.sink, target)
    }
  }

  return { setSource, releaseAll }
}

function stickGroup(source: RemapControllerRef): string | undefined {
  if (source.control.kind !== "stick") return undefined
  return `${source.player}.stick.${source.control.stick}`
}
