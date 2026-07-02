import { RegistryProvider, useAtomValue } from "@effect/atom-react"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import { makeInMemoryLibrarySourceLayer } from "@platform/library/library-source-layer-memory"
import {
  catalogFactsSourceLayerAtom,
  catalogSnapshotAtom,
} from "@platform/react/catalog/catalog-atoms"
import { deviceStateAtom } from "@platform/react/device/device-atoms"
import {
  foregroundSessionGateStateAtom,
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { ShiftLibraryDeck } from "@product/surfaces/web/shift/pages/ShiftLibraryDeck"
import { ShiftLibraryFilterBar } from "@product/surfaces/web/shift/pages/ShiftLibraryFilterBar"
import { ShiftLibraryGrid } from "@product/surfaces/web/shift/pages/ShiftLibraryGrid"
import { ShiftLibraryLens } from "@product/surfaces/web/shift/pages/ShiftLibraryLens"
import { ShiftLibraryReel } from "@product/surfaces/web/shift/pages/ShiftLibraryReel"
import { ShiftLibraryShelves } from "@product/surfaces/web/shift/pages/ShiftLibraryShelves"
import type { ShiftLibraryGame } from "@product/surfaces/web/shift/pages/shift-library-game"
import { buildShiftLibrarySections } from "@product/surfaces/web/shift/pages/shift-library-sections"
import {
  foregroundStateFromAtom,
  ShiftHomeStateView,
} from "@product/surfaces/web/shift/routes/ShiftHomeRoute"
import {
  DEFAULT_SHIFT_CLOCK_ISO,
  SHIFT_CLOCK_PRESETS,
  shiftClockIsoAtom,
  shiftClockIsoForValue,
  shiftClockLabelForIso,
} from "@product/surfaces/web/shift/shift-clock-state"
import { shiftForegroundSourceLayers } from "@product/surfaces/web/shift/shift-foreground-preview"
import {
  DEFAULT_SHIFT_NETWORK_READING,
  type ShiftNetworkReading,
  shiftNetworkReadingAtom,
  shiftNetworkReadingForValue,
} from "@product/surfaces/web/shift/shift-network-state"
import {
  DEFAULT_SHIFT_POWER_READING,
  type ShiftPowerReading,
  shiftBatteryPropsForPowerDisplay,
  shiftDeviceStateForPowerReading,
  shiftPowerDisplayForDeviceState,
  shiftPowerReadingAtom,
  shiftPowerReadingForValue,
} from "@product/surfaces/web/shift/shift-power-state"
import { ShiftBattery } from "@product/surfaces/web/shift/ui/atoms/ShiftBattery"
import { ShiftStatusBar } from "@product/surfaces/web/shift/ui/molecules/ShiftStatusBar"
import { ShiftPartFrame } from "@product/surfaces/web/shift/ui/ShiftPartFrame"
import type { ReactNode } from "react"
import type { Story } from "../../types"
import { LAB_VARIANT_INPUT_ID } from "../model/lab-object-inputs"
import type { LabInputControl, LabInputValue } from "../model/lab-source-state"
import {
  shiftCatalogLayerForBinding,
  shiftEntriesForBinding,
  shiftLibraryGamesForBinding,
} from "../seed/shift-seed"
import type { LabSurfacePartMountSpec } from "../surface-registry"

/**
 * Render a placed Shift Home page part on the Workshop board through the REAL
 * edges, seeded for the object's chosen fixture source plus Data, Foreground,
 * Power, Clock, and Network values. Home reads the production atoms; swapping
 * any input in the object's inspector re-seeds those atoms.
 */
export const SHIFT_POWER_INPUT_ID = "power"
export const SHIFT_CLOCK_INPUT_ID = "clock"
export const SHIFT_NETWORK_INPUT_ID = "network"

export const SHIFT_POWER_INPUT_CONTROL: LabInputControl = {
  kind: "object",
  fields: [
    {
      id: "percent",
      label: "Battery",
      defaultValue: DEFAULT_SHIFT_POWER_READING.percent,
      control: { kind: "range", min: 0, max: 100, step: 1, unit: "%" },
    },
    {
      id: "charging",
      label: "Charging",
      defaultValue: DEFAULT_SHIFT_POWER_READING.charging,
      control: { kind: "boolean" },
    },
  ],
}

export const SHIFT_CLOCK_INPUT_CONTROL: LabInputControl = {
  kind: "iso-datetime",
  options: SHIFT_CLOCK_PRESETS,
}

export const SHIFT_NETWORK_INPUT_CONTROL: LabInputControl = {
  kind: "tagged",
  tagField: "_tag",
  cases: [
    { tag: "Disconnected", label: "Disconnected", fields: [] },
    {
      tag: "Connected",
      label: "Connected",
      fields: [
        {
          id: "strengthPercent",
          label: "Signal",
          defaultValue:
            DEFAULT_SHIFT_NETWORK_READING._tag === "Connected"
              ? DEFAULT_SHIFT_NETWORK_READING.strengthPercent
              : 80,
          control: { kind: "range", min: 0, max: 100, step: 1, unit: "%" },
        },
      ],
    },
  ],
}

function ShiftHomeFromEdge() {
  const result = useAtomValue(catalogSnapshotAtom)
  const foreground = foregroundStateFromAtom(
    useAtomValue(foregroundSessionGateStateAtom),
  )
  return <ShiftHomeStateView result={result} foreground={foreground} />
}

export function isShiftHomeStory(story: Story): boolean {
  // The catalog names Home stories "Home"; generated takes and older fixtures
  // qualify with a suffix ("Home · Ready"), so match the qualified form too.
  return (
    story.layer === "page" &&
    (story.name === "Home" || story.name.startsWith("Home ·"))
  )
}

export function isShiftBatteryStory(story: Story): boolean {
  return story.layer === "atom" && story.name === "Battery"
}

export function isShiftStatusBarStory(story: Story): boolean {
  return story.layer === "molecule" && story.name === "Status Bar"
}

function powerFromBinding(
  binding: Readonly<Record<string, LabInputValue>>,
): ShiftPowerReading {
  return shiftPowerReadingForValue(binding[SHIFT_POWER_INPUT_ID])
}

function clockFromBinding(
  binding: Readonly<Record<string, LabInputValue>>,
  fallback: LabInputValue | undefined,
): string {
  return shiftClockIsoForValue(
    typeof binding[SHIFT_CLOCK_INPUT_ID] === "string"
      ? binding[SHIFT_CLOCK_INPUT_ID]
      : typeof binding[LAB_VARIANT_INPUT_ID] === "string"
        ? binding[LAB_VARIANT_INPUT_ID]
        : typeof fallback === "string"
          ? fallback
          : DEFAULT_SHIFT_CLOCK_ISO,
  )
}

function networkFromBinding(
  binding: Readonly<Record<string, LabInputValue>>,
): ShiftNetworkReading {
  return shiftNetworkReadingForValue(binding[SHIFT_NETWORK_INPUT_ID])
}

function tagFromInput(
  value: LabInputValue | undefined,
  fallback: string,
): string {
  return typeof value === "string" ? value : fallback
}

/**
 * Real derivation hosts for isolated device-fact parts: the SAME
 * `deviceStateAtom` → `shiftPowerDisplayForDeviceState` → props chain the
 * Home route runs, mounted directly above the leaf component. Leaf atoms stay
 * prop-driven (the atomic-layering rule); the event→state derivation lives at
 * this composing level, so an isolated part reacts to device events exactly
 * like production — never through hand-set props.
 */
function ShiftBatteryFromDeviceState() {
  const battery = shiftBatteryPropsForPowerDisplay(
    shiftPowerDisplayForDeviceState(useAtomValue(deviceStateAtom)),
  )
  return battery ? <ShiftBattery {...battery} /> : null
}

function ShiftStatusBarFromEdges() {
  const battery = shiftBatteryPropsForPowerDisplay(
    shiftPowerDisplayForDeviceState(useAtomValue(deviceStateAtom)),
  )
  const clockIso = useAtomValue(shiftClockIsoAtom)
  const network = useAtomValue(shiftNetworkReadingAtom)
  return (
    <ShiftStatusBar
      time={shiftClockLabelForIso(clockIso)}
      avatarSrc="https://i.pravatar.cc/96?u=korri-shift-user"
      battery={battery}
      network={network}
    />
  )
}

/**
 * The Library page variants keyed by design-part name: each renders the real
 * full-screen composition from the chosen fixture library through the real
 * `games` component input (the variants' data edge — they are prop-driven by
 * design; the composition root supplies the projection).
 */
const SHIFT_LIBRARY_PAGE_RENDERERS: Readonly<
  Record<string, (games: readonly ShiftLibraryGame[]) => ReactNode>
> = {
  "Library — Grid": games => <ShiftLibraryGrid games={games} />,
  "Library — Shelves": games => (
    <ShiftLibraryShelves sections={buildShiftLibrarySections(games)} />
  ),
  "Library — Lens": games => <ShiftLibraryLens games={games} />,
  "Library — Filter Bar": games => <ShiftLibraryFilterBar games={games} />,
  "Library — Deck": games => <ShiftLibraryDeck games={games} />,
  "Library — Reel": games => <ShiftLibraryReel games={games} />,
}

export function renderShiftSurfacePart(
  story: Story,
  binding: {
    readonly sourceId: string
    readonly inputValues: Readonly<Record<string, LabInputValue>>
  },
): ReactNode {
  const libraryRenderer =
    story.layer === "page"
      ? SHIFT_LIBRARY_PAGE_RENDERERS[story.name]
      : undefined
  if (libraryRenderer) {
    return libraryRenderer(
      story.state === "Empty"
        ? []
        : shiftLibraryGamesForBinding(binding.sourceId),
    )
  }

  if (!isShiftHomeStory(story)) return story.render()

  const spec = shiftSurfacePartMount(story, binding)
  if (!spec) return story.render()
  return (
    <RegistryProvider
      key={`${binding.sourceId}:${JSON.stringify(binding.inputValues)}`}
      initialValues={spec.initialValues}
    >
      {spec.node}
    </RegistryProvider>
  )
}

/**
 * The binding→atoms projection for a placed Home part: every real atom Home's
 * subtree reads, valued for the object's current source/state/input binding.
 * Seeded into a fresh part registry at mount and re-written into the SAME live
 * registry when the binding changes — one source of truth for both the live
 * part mount and the legacy static render above.
 */
export function shiftSurfacePartMount(
  story: Story,
  binding: {
    readonly sourceId: string
    readonly inputValues: Readonly<Record<string, LabInputValue>>
  },
): LabSurfacePartMountSpec | null {
  if (isShiftBatteryStory(story)) {
    const power = powerFromBinding(binding.inputValues)
    const initialValues = [
      [deviceStateAtom, shiftDeviceStateForPowerReading(power)],
    ] as const
    return {
      initialValues:
        initialValues as unknown as LabSurfacePartMountSpec["initialValues"],
      node: (
        <ShiftPartFrame width={120} height={120}>
          <ShiftBatteryFromDeviceState />
        </ShiftPartFrame>
      ),
    }
  }

  if (isShiftStatusBarStory(story)) {
    const power = powerFromBinding(binding.inputValues)
    const clock = clockFromBinding(binding.inputValues, story.state)
    const network = networkFromBinding(binding.inputValues)
    const initialValues = [
      [deviceStateAtom, shiftDeviceStateForPowerReading(power)],
      [shiftPowerReadingAtom, power],
      [shiftClockIsoAtom, clock],
      [shiftNetworkReadingAtom, network],
    ] as const
    return {
      initialValues:
        initialValues as unknown as LabSurfacePartMountSpec["initialValues"],
      node: (
        <ShiftPartFrame height={140}>
          <ShiftStatusBarFromEdges />
        </ShiftPartFrame>
      ),
    }
  }

  if (!isShiftHomeStory(story)) return null

  const power = powerFromBinding(binding.inputValues)
  const clock = clockFromBinding(binding.inputValues, undefined)
  const network = networkFromBinding(binding.inputValues)
  const dataTag = tagFromInput(
    binding.inputValues[LAB_VARIANT_INPUT_ID],
    "Ready",
  )
  const catalogLayer = shiftCatalogLayerForBinding(binding.sourceId, dataTag)
  const entries = shiftEntriesForBinding(binding.sourceId)
  const foregroundTag = tagFromInput(binding.inputValues.foreground, "Ready")
  const makeForeground =
    shiftForegroundSourceLayers[
      foregroundTag as keyof typeof shiftForegroundSourceLayers
    ] ?? shiftForegroundSourceLayers.Ready
  const initialValues = [
    [catalogFactsSourceLayerAtom, catalogLayer],
    [foregroundSessionStatusLayerAtom, makeForeground()],
    [shiftPowerReadingAtom, power],
    [deviceStateAtom, shiftDeviceStateForPowerReading(power)],
    [shiftClockIsoAtom, clock],
    [shiftNetworkReadingAtom, network],
    [
      librarySourceLayerAtom,
      makeInMemoryLibrarySourceLayer({ playableEntries: entries }),
    ],
    [
      launcherLayerAtom,
      makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
    ],
  ] as const
  return {
    initialValues:
      initialValues as unknown as LabSurfacePartMountSpec["initialValues"],
    node: <ShiftHomeFromEdge />,
  }
}
