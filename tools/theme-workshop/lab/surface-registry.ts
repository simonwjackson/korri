import type { DualScreenChannelFactory } from "@platform/react/display/dual-screen/DualScreenBroadcastSessionRoot"
import type { DualScreenRole } from "@platform/react/display/dual-screen/dual-screen-events"
import type { RouterHistory } from "@tanstack/history"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { ReactNode } from "react"
import type { DeviceConfig, ThemeKnob } from "../device-lab"
import type { Story, WorkshopControl } from "../types"
import { boxbusterLabSurfaceAdapter } from "./adapters/boxbuster"
import { picoLabSurfaceAdapter } from "./adapters/pico"
import { shiftLabSurfaceAdapter } from "./adapters/shift"
import type {
  LabSourceOption,
  LabStateOption,
  SourceStatus,
} from "./model/lab-source-state"
import type { LabScreenCoordinate, LabStateAxis } from "./model/lab-state-axis"

export interface LabMountedSurface {
  readonly router: unknown
  readonly dispose: () => void
}

export interface LabSurfacePartAxis {
  readonly id: string
  readonly label: string
  readonly states: readonly LabStateOption[]
}

export interface LabSurfaceDualScreenOptions {
  readonly role: DualScreenRole
  readonly channelName: string
  readonly createChannel?: DualScreenChannelFactory
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
  /** Read the surface's current coordinate as per-axis state tags (or tag sets
   * for multi axes), so a design tool can capture a running exploration back
   * into an Inspect pin. Honors axis nesting (an inactive nested axis maps to
   * the live sentinel). */
  readonly captureCoordinate?: (screenPath: string) => LabScreenCoordinate
  /** Surface-owned live controls (e.g. pico's palette/granularity), rendered
   * neutrally by the lab. A hook so control values track surface state. */
  readonly useControls?: () => readonly WorkshopControl[]
  readonly knobs?: readonly ThemeKnob[]
  readonly defaultPxPerMm?: number
  /** Surface-owned route for secondary/companion screens in a multi-screen
   * device. The generic lab canvas only arranges screens; the adapter decides
   * what route a secondary surface should mount.
   */
  readonly secondaryScreenPath?: string
  readonly createDualScreenChannel?: DualScreenChannelFactory
  /** Wraps an isolated part preview in the surface's style scope so its tokens
   * and recipes resolve outside a full mount (e.g. pico needs
   * [data-pico].pico-screen.intrinsic). Omit when parts are self-scoping. */
  readonly previewScope?: (children: ReactNode) => ReactNode
  /** Render a placed surface/page part on the Workshop board through the real
   * data edge, seeded for the object's source + Data state + any extra-axis pins
   * — so per-object state swap works like Preview. Omit to fall back to the
   * part's baked render. */
  readonly renderSurfacePart?: (
    story: Story,
    binding: {
      readonly sourceId: string
      readonly stateId: SourceStatus
      readonly axisStateIds?: Readonly<Record<string, SourceStatus>>
    },
  ) => ReactNode
  /** Extra state-machine dials (beyond the primary Data state) a surface part
   * exposes per Workshop object, e.g. Foreground. Drives `renderSurfacePart`'s
   * `axisStateIds`. Omit when a surface part has a single state dimension. */
  readonly surfacePartAxes?: (story: Story) => readonly LabSurfacePartAxis[]
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
      readonly dualScreen?: LabSurfaceDualScreenOptions
      /** Receive the mounted surface's atom registry so the lab can drive the
       * real source atoms live (e.g. a state axis pinning the data source). */
      readonly onRegistry?: (registry: AtomRegistry.AtomRegistry) => void
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
