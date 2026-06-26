import type { RouterHistory } from "@tanstack/history"
import type { ReactNode } from "react"
import type { DeviceConfig, ThemeKnob } from "../device-lab"
import type { WorkshopControl } from "../types"
import { boxbusterLabSurfaceAdapter } from "./adapters/boxbuster"
import { picoLabSurfaceAdapter } from "./adapters/pico"
import { shiftLabSurfaceAdapter } from "./adapters/shift"
import type {
  LabSourceOption,
  LabStateOption,
  SourceStatus,
} from "./model/lab-source-state"
import type { LabAxisActiveMap, LabStateAxis } from "./model/lab-state-axis"

export interface LabMountedSurface {
  readonly router: unknown
  readonly dispose: () => void
}

export interface LabSurfaceScreen {
  readonly label: string
  readonly path: string
}

export interface LabSurfaceAdapter {
  readonly id: string
  readonly devices: readonly DeviceConfig[]
  readonly screens?: readonly LabSurfaceScreen[]
  /** The state-machine axes a given screen (by route path) exposes — each wired
   * to the surface's production-inert preview singletons. Screens with no state
   * machine (or surfaces with none at all) return an empty list. Derived from
   * the machine tags, never hand-authored. */
  readonly axesForScreen?: (screenPath: string) => readonly LabStateAxis[]
  /** Read the surface's current coordinate as per-axis state tags (Live → the
   * live sentinel), so a design tool can capture a running exploration back into
   * an Inspect pin. Honors axis nesting (an inactive nested axis maps to Live). */
  readonly captureCoordinate?: (screenPath: string) => LabAxisActiveMap
  /** Surface-owned live controls (e.g. pico's palette/granularity), rendered
   * neutrally by the lab. A hook so control values track surface state. */
  readonly useControls?: () => readonly WorkshopControl[]
  readonly knobs?: readonly ThemeKnob[]
  readonly defaultPxPerMm?: number
  /** Wraps an isolated part preview in the surface's style scope so its tokens
   * and recipes resolve outside a full mount (e.g. pico needs
   * [data-pico].pico-screen.intrinsic). Omit when parts are self-scoping. */
  readonly previewScope?: (children: ReactNode) => ReactNode
  readonly sources?: readonly LabSourceOption[]
  readonly states?: readonly LabStateOption[]
  readonly makeSeedInitialValues: () => Promise<unknown>
  readonly makeSeedInitialValuesForBinding?: (binding: {
    readonly sourceId: string
    readonly stateId: SourceStatus
  }) => Promise<unknown>
  readonly mountSurface: (
    host: HTMLElement,
    options: {
      readonly initialValues: unknown
      readonly history?: RouterHistory
    },
  ) => LabMountedSurface
}

const LAB_SURFACE_ADAPTERS: readonly LabSurfaceAdapter[] = [
  shiftLabSurfaceAdapter,
  picoLabSurfaceAdapter,
  boxbusterLabSurfaceAdapter,
]

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
