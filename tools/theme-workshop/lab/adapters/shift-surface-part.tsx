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
  shiftBatteryPropsForPowerReading,
  shiftDeviceStateForPowerReading,
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
} from "../seed/shift-seed"

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

function isShiftHomeStory(story: Story): boolean {
  return story.layer === "page" && story.name === "Home"
}

function isShiftBatteryStory(story: Story): boolean {
  return story.layer === "atom" && story.name === "Battery"
}

function isShiftStatusBarStory(story: Story): boolean {
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

function renderShiftBatteryPart(power: ShiftPowerReading): ReactNode {
  return (
    <ShiftPartFrame width={120} height={120}>
      <ShiftBattery {...shiftBatteryPropsForPowerReading(power)} />
    </ShiftPartFrame>
  )
}

function renderShiftStatusBarPart({
  power,
  clock,
  network,
}: {
  readonly power: ShiftPowerReading
  readonly clock: string
  readonly network: ShiftNetworkReading
}): ReactNode {
  return (
    <ShiftPartFrame height={140}>
      <ShiftStatusBar
        time={shiftClockLabelForIso(clock)}
        avatarSrc="https://i.pravatar.cc/96?u=korri-shift-user"
        battery={shiftBatteryPropsForPowerReading(power)}
        network={network}
      />
    </ShiftPartFrame>
  )
}

export function renderShiftSurfacePart(
  story: Story,
  binding: {
    readonly sourceId: string
    readonly inputValues: Readonly<Record<string, LabInputValue>>
  },
): ReactNode {
  if (isShiftBatteryStory(story)) {
    return renderShiftBatteryPart(powerFromBinding(binding.inputValues))
  }

  if (isShiftStatusBarStory(story)) {
    return renderShiftStatusBarPart({
      power: powerFromBinding(binding.inputValues),
      clock: clockFromBinding(binding.inputValues, story.state),
      network: networkFromBinding(binding.inputValues),
    })
  }

  if (!isShiftHomeStory(story)) return story.render()

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
  return (
    <RegistryProvider
      key={`${binding.sourceId}:${dataTag}:${foregroundTag}:${JSON.stringify(power)}:${clock}:${JSON.stringify(network)}`}
      initialValues={[
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
      ]}
    >
      <ShiftHomeFromEdge />
    </RegistryProvider>
  )
}
