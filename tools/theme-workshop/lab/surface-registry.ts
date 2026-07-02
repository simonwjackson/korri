import type { DualScreenChannelFactory } from "@platform/react/display/dual-screen/DualScreenBroadcastSessionRoot"
import type { DualScreenRole } from "@platform/react/display/dual-screen/dual-screen-events"
import type { RouterHistory } from "@tanstack/history"
import type * as Atom from "effect/unstable/reactivity/Atom"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { ComponentType, ReactNode } from "react"
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

export interface LabSurfaceInputContext {
  /** Canvas object that owns the mounted surface instance, when the edit is
   * scoped to one live device. Omitted means apply to every mounted surface. */
  readonly scopeId?: string
}

export interface LabSurfacePartInput {
  readonly id: string
  readonly label: string
  readonly defaultValue: LabInputValue
  readonly control: LabInputControl
  readonly apply?: (
    value: LabInputValue,
    context?: LabSurfaceInputContext,
  ) => void
  readonly release?: (context?: LabSurfaceInputContext) => void
}

/** Where a fired event should land. Mirrors LabSurfaceInputContext so events and
 * inputs scope to the same live-device registries. */
export interface LabSurfaceEventContext {
  /** Live device object that owns the mounted surface instance, when the emit is
   * scoped to one device. Omitted means broadcast to every mounted surface. */
  readonly scopeId?: string
}

/**
 * A discrete device event a surface can be driven by — the fire-and-observe
 * counterpart to `LabSurfacePartInput` (a held value). Where an input pins a
 * value the surface keeps reading, an event models a fact the surface receives
 * over time (e.g. a battery-changed or network-changed device event) and reacts
 * to through its real event/subscription pipeline. The lab renders the payload
 * editor from `payload` (reusing the input-control vocabulary) and calls `emit`
 * when the operator sends the event.
 */
export interface LabSurfaceEvent {
  readonly id: string
  readonly label: string
  /** Editable shape of this event's payload; reuses the input-control kinds. */
  readonly payload: LabInputControl
  readonly defaultPayload: LabInputValue
  /** Deliver one discrete event with the composed payload into every (or one
   * scoped) mounted surface. */
  readonly emit: (
    payload: LabInputValue,
    context?: LabSurfaceEventContext,
  ) => void
}

/** One mount-time atom seed pair for a part registry root. */
export type LabPartSeedEntry = readonly [Atom.Atom<unknown>, unknown]

/**
 * Live-mount spec for one placed part: the binding→atoms projection (the real
 * atoms the part's subtree reads, valued for the object's current binding)
 * plus the part's real component subtree. The lab seeds `initialValues` into a
 * fresh registry at mount and re-writes the projection into the SAME live
 * registry when the binding changes — the part is driven through real atoms,
 * never re-rendered from props.
 */
export interface LabSurfacePartMountSpec {
  readonly initialValues: readonly LabPartSeedEntry[]
  /** Per-pair change keys aligned with `initialValues`: on a binding edit the
   * mount re-writes ONLY pairs whose key changed, so editing one input never
   * rolls back event-driven facts held by unrelated atoms. Omit to re-write
   * every pair on any binding change. */
  readonly reseedKeys?: readonly string[]
  readonly node: ReactNode
}

/** Props of a surface-owned part registry root (see `partRegistryRoot`). */
export interface LabPartRegistryRootProps {
  readonly initialValues: readonly LabPartSeedEntry[]
  readonly onRegistry?: (registry: AtomRegistry.AtomRegistry) => void
  readonly children?: ReactNode
}

export interface LabSurfaceDualScreenOptions {
  readonly role: DualScreenRole
  readonly channelName: string
  readonly createChannel?: DualScreenChannelFactory
}

export interface LabSurfaceScreen {
  readonly label: string
  readonly path: string
  /** Stable design-part id of the page part this screen composes, so edge
   * inheritance resolves by identity instead of display text. Falls back to
   * label ↔ story-name matching when omitted. */
  readonly pagePartId?: string
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
  /** Discrete device events the mounted screen can be driven by, e.g. a battery
   * or network device-fact change. Rendered by the lab as payload editors with a
   * Send action, dispatched into the surface's real event pipeline. Screens with
   * no events (or surfaces with none) return an empty list. */
  readonly eventsForScreen?: (screenPath: string) => readonly LabSurfaceEvent[]
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
  /** Surface-owned registry root that hosts one part's real component with a
   * fresh registry and reports it — the product-side part counterpart of
   * `mountSurface` (e.g. Shift's `ShiftPartSurface`). Required for
   * `surfacePartMount` to take effect. */
  readonly partRegistryRoot?: ComponentType<LabPartRegistryRootProps>
  /** Live-mount spec for a placed part: same real mount + scoped registry path
   * a live device uses, so part edges (axes/inputs/events) drive real atoms.
   * Return null for parts not yet migrated; the lab falls back to
   * `renderSurfacePart` / the story's baked render. */
  readonly surfacePartMount?: (
    story: Story,
    binding: {
      readonly sourceId: string
      readonly inputValues: Readonly<Record<string, LabInputValue>>
    },
  ) => LabSurfacePartMountSpec | null
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
  /** Discrete device events a PART's real subtree consumes, keyed by story —
   * the part-scoped counterpart of `eventsForScreen`. Devices inherit their
   * events from the page part their screen composes (see
   * model/lab-part-edges.ts); parts fire them into their own scoped registry. */
  readonly surfacePartEvents?: (story: Story) => readonly LabSurfaceEvent[]
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
