import type { RouterHistory } from "@tanstack/history"
import type { Router } from "@tanstack/react-router"
import type { DeviceConfig, ThemeKnob } from "../device-lab"
import { shiftLabSurfaceAdapter } from "./adapters/shift"

export interface LabMountedSurface {
  readonly router: Router
  readonly dispose: () => void
}

export interface LabSurfaceAdapter<InitialValues = unknown> {
  readonly id: string
  readonly devices: readonly DeviceConfig[]
  readonly knobs?: readonly ThemeKnob[]
  readonly defaultPxPerMm?: number
  readonly scaleVarPrefix?: string
  readonly makeSeedInitialValues: () => Promise<InitialValues>
  readonly mountSurface: (
    host: HTMLElement,
    options: {
      readonly initialValues: InitialValues
      readonly history?: RouterHistory
    },
  ) => LabMountedSurface
}

const LAB_SURFACE_ADAPTERS = [shiftLabSurfaceAdapter] as const

export function labSurfaceAdapters(): readonly LabSurfaceAdapter[] {
  return LAB_SURFACE_ADAPTERS
}

export function resolveLabSurfaceAdapter(id: string): LabSurfaceAdapter {
  const adapter = LAB_SURFACE_ADAPTERS.find(candidate => candidate.id === id)
  if (!adapter) throw new Error(`Unknown lab surface adapter ${id}`)
  return adapter
}

export function defaultLabSurfaceAdapterId(): string {
  return LAB_SURFACE_ADAPTERS[0]?.id ?? "shift"
}
