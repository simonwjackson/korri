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
  LabInputControl,
  LabInputOption,
  LabInputValue,
  LabSourceOption,
} from "./model/lab-source-state"
import type { LabScreenCoordinate, LabStateAxis } from "./model/lab-state-axis"

export interface LabMountedSurface {
  readonly router: unknown
  readonly dispose: () => void
}

export interface LabSurfacePartInput {
  readonly id: string
  readonly label: string
  readonly defaultValue: LabInputValue
  readonly control: LabInputControl
  readonly apply?: (value: LabInputValue) => void
  readonly release?: () => void
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
  /** Product inputs the mounted screen exposes outside its state-machine axes,
   * e.g. power readings, clock, and network signal. */
  readonly inputsForScreen?: (
    screenPath: string,
  ) => readonly LabSurfacePartInput[]
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
  /** Render a placed part on the Workshop board through the real data edge or
   * component input the surface owns. Page parts use source/input data;
   * smaller parts can feed the same selected input values into their real
   * component props. Omit to fall back to the part's baked render. */
  readonly renderSurfacePart?: (
    story: Story,
    binding: {
      readonly sourceId: string
      readonly inputValues: Readonly<Record<string, LabInputValue>>
    },
  ) => ReactNode
  /** Surface-owned product inputs a Compose object exposes in addition to any
   * discovered variant family, e.g. Shift Home Foreground. The adapter filters by
   * story so unrelated pages/parts do not show controls they cannot consume. */
  readonly surfacePartInputs?: (story: Story) => readonly LabSurfacePartInput[]
  readonly sources?: readonly LabSourceOption[]
  readonly states?: readonly LabInputOption[]
  readonly makeSeedInitialValues: () => Promise<unknown>
  readonly makeSeedInitialValuesForBinding?: (binding: {
    readonly sourceId: string
    readonly stateId: LabInputValue
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
