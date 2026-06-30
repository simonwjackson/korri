import { useLayoutEffect, useMemo, useState } from "react"
import {
  axisEnabled,
  isAxisLive,
  LAB_AXIS_LIVE,
  type LabAxisActive,
  type LabAxisCoordinate,
  type LabScreenActive,
  type LabStateAxis,
  liveActiveMap,
  pinAxisActive,
  releaseAxisActive,
  restorePinsActive,
} from "./model/lab-state-axis"
import type { LabSurfaceAdapter } from "./surface-registry"

export interface LabAxisController {
  readonly screenAxes: readonly LabStateAxis[]
  readonly activeByAxis: LabScreenActive
  readonly mode: "inspect" | "live"
  readonly pinAxis: (axisId: string, stateId: string) => void
  readonly liveAxis: (axisId: string) => void
  /** Capture the running surface's coordinate as Inspect pins, when the surface
   * supports it; undefined otherwise (the States panel hides the control). */
  readonly pinCurrent: (() => void) | undefined
  readonly toggleMode: () => void
}

function multiSetFromCoordinate(value: LabAxisCoordinate | undefined) {
  if (value?.kind !== "multi") return new Set<string>()
  return new Set(value.values.filter(state => state !== LAB_AXIS_LIVE))
}

function activeFromCoordinate(
  axis: LabStateAxis,
  value: LabAxisCoordinate | undefined,
): LabAxisActive {
  if (axis.kind === "multi")
    return { kind: "multi", on: multiSetFromCoordinate(value) }
  return {
    kind: "single",
    value: value?.kind === "single" ? value.value : LAB_AXIS_LIVE,
  }
}

function applyPreview(axis: LabStateAxis, active: LabAxisActive) {
  if (isAxisLive(active)) {
    axis.release()
    return
  }
  if (active.kind === "single") {
    axis.pin(active.value)
    return
  }
  axis.release()
  for (const stateId of active.on) axis.pin(stateId)
}

/**
 * Owns the page-axis lifecycle for the lab: which screen's axes are active, the
 * per-axis pinned/Live map, the derived global Inspect/Live mode, and the
 * pin/release side effects against the surface's real state edges — including
 * nested-axis release and the release-on-selection-change cleanup. Kept out of
 * LabShell so the ordering contract lives (and is tested) in one place.
 */
export function useLabAxisController(
  adapter: LabSurfaceAdapter,
): LabAxisController {
  // The surface's home screen (its first screen that exposes axes) is the live
  // target the axes drive.
  const activeScreenPath = useMemo(() => {
    for (const screen of adapter.screens ?? []) {
      if ((adapter.axesForScreen?.(screen.path) ?? []).length > 0)
        return screen.path
    }
    return "/"
  }, [adapter])

  // Axes are the live surface's state machines and no longer depend on part
  // selection: parts are static and drive their own fixture states instead. The
  // axes belong to the Preview view (see LabShell, which only shows them there).
  const screenAxes = useMemo(
    () => adapter.axesForScreen?.(activeScreenPath) ?? [],
    [adapter, activeScreenPath],
  )

  const [activeByAxis, setActiveByAxis] = useState<LabScreenActive>(() =>
    liveActiveMap(screenAxes),
  )
  // Pins remembered while in Live, so toggling back to Inspect restores them.
  const [rememberedByAxis, setRememberedByAxis] = useState<LabScreenActive>({})
  // Mode is derived: any pinned axis ⇒ Inspect; everything Live ⇒ Live.
  const mode: "inspect" | "live" = screenAxes.some(
    axis => !isAxisLive(activeByAxis[axis.id]),
  )
    ? "inspect"
    : "live"

  // Commit a new active map, first releasing any nested axis that is no longer
  // meaningful (e.g. Launch once Data leaves Ready) so a stale pin can't strand
  // a greyed-out, unreleasable overlay.
  const applyAxisMap = (next: LabScreenActive) => {
    let result = next
    let changed = true
    while (changed) {
      changed = false
      for (const axis of screenAxes) {
        if (!axisEnabled(axis, result) && !isAxisLive(result[axis.id])) {
          axis.release()
          result = releaseAxisActive(result, axis)
          changed = true
        }
      }
    }
    setActiveByAxis(result)
  }

  const pinAxis = (axisId: string, stateId: string) => {
    const axis = screenAxes.find(candidate => candidate.id === axisId)
    if (!axis) return
    const current = activeByAxis[axisId]
    if (
      axis.kind === "multi" &&
      current?.kind === "multi" &&
      current.on.has(stateId)
    ) {
      const next = releaseAxisActive(activeByAxis, axis, stateId)
      const active = next[axis.id]
      if (active) applyPreview(axis, active)
      applyAxisMap(next)
      return
    }
    axis.pin(stateId)
    applyAxisMap(pinAxisActive(activeByAxis, axis, stateId))
  }
  const liveAxis = (axisId: string) => {
    const axis = screenAxes.find(candidate => candidate.id === axisId)
    if (!axis) return
    axis.release()
    applyAxisMap(releaseAxisActive(activeByAxis, axis))
  }

  // Capture-back: read the running surface's current coordinate and map it onto
  // the axis pins (Live → Inspect), so a live exploration becomes addressable.
  const pinCurrent = () => {
    const captured = adapter.captureCoordinate?.(activeScreenPath)
    if (!captured) return
    const next: Record<string, LabAxisActive | undefined> = { ...activeByAxis }
    for (const axis of screenAxes) {
      const active = activeFromCoordinate(axis, captured[axis.id])
      applyPreview(axis, active)
      next[axis.id] = active
    }
    applyAxisMap(next)
  }

  // The global headline: Live releases every axis (hands the running app the
  // wheel from the current coordinate, route preserved) and remembers the pins;
  // Inspect re-applies them. "Go live from here" falls out for free.
  const toggleMode = () => {
    if (mode === "live") {
      for (const axis of screenAxes) {
        const remembered = rememberedByAxis[axis.id]
        if (remembered && !isAxisLive(remembered))
          applyPreview(axis, remembered)
      }
      setActiveByAxis(
        restorePinsActive(screenAxes, activeByAxis, rememberedByAxis),
      )
    } else {
      setRememberedByAxis(activeByAxis)
      for (const axis of screenAxes) axis.release()
      setActiveByAxis(liveActiveMap(screenAxes))
    }
  }

  // Release the active axis pins whenever the surface (and thus its axis set)
  // changes, so a pin can never leak onto a surface where it has no visible
  // release control. axes is recomputed from the deps (not the screenAxes memo)
  // so the effect only re-runs on a real axis-set change.
  useLayoutEffect(() => {
    const axes = adapter.axesForScreen?.(activeScreenPath) ?? []
    setActiveByAxis(liveActiveMap(axes))
    setRememberedByAxis({})
    return () => {
      for (const axis of axes) axis.release()
    }
  }, [adapter, activeScreenPath])

  return {
    screenAxes,
    activeByAxis,
    mode,
    pinAxis,
    liveAxis,
    pinCurrent: adapter.captureCoordinate ? pinCurrent : undefined,
    toggleMode,
  }
}
