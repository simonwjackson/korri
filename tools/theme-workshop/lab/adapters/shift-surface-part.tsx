import { RegistryProvider, useAtomValue } from "@effect/atom-react"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import { makeInMemoryLibrarySourceLayer } from "@platform/library/library-source-layer-memory"
import {
  catalogFactsSourceLayerAtom,
  catalogSnapshotAtom,
} from "@platform/react/catalog/catalog-atoms"
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
  SHIFT_NETWORK_STATUS_TAGS,
  shiftNetworkStatusAtom,
  shiftNetworkStatusForValue,
} from "@product/surfaces/web/shift/shift-network-state"
import {
  DEFAULT_SHIFT_POWER_STATE,
  SHIFT_POWER_STATE_TAGS,
  type ShiftPowerState,
  shiftBatteryPropsForPowerState,
  shiftPowerStateAtom,
} from "@product/surfaces/web/shift/shift-power-state"
import { ShiftBattery } from "@product/surfaces/web/shift/ui/atoms/ShiftBattery"
import { ShiftStatusBar } from "@product/surfaces/web/shift/ui/molecules/ShiftStatusBar"
import { ShiftPartFrame } from "@product/surfaces/web/shift/ui/ShiftPartFrame"
import type { ReactNode } from "react"
import type { Story } from "../../types"
import { LAB_VARIANT_INPUT_ID } from "../model/lab-object-inputs"
import type { LabInputValue } from "../model/lab-source-state"
import {
  shiftCatalogLayerForBinding,
  shiftEntriesForBinding,
} from "../seed/shift-seed"

/**
 * Render a placed Shift Home page part on the Workshop board through the REAL
 * edges, seeded for the object's chosen fixture source plus Data, Foreground,
 * Power, Clock, and Network values. Home reads the production atoms; swapping
 * any dial in the object's inspector re-seeds those atoms, so the same page
 * renders that Data×Foreground×Power×Clock×Network combination — the same swap
 * that works in Preview, now per object. Non-Home page parts keep their own
 * selected story render instead of falling through to Home.
 */
export const SHIFT_POWER_INPUT_ID = "power"
export const SHIFT_CLOCK_INPUT_ID = "clock"
export const SHIFT_NETWORK_INPUT_ID = "network"

export const SHIFT_POWER_STATE_OPTIONS = SHIFT_POWER_STATE_TAGS.map(tag => ({
  id: tag,
  label: tag,
}))

export const SHIFT_CLOCK_OPTIONS = SHIFT_CLOCK_PRESETS

export const SHIFT_NETWORK_STATE_OPTIONS = SHIFT_NETWORK_STATUS_TAGS.map(
  tag => ({
    id: tag,
    label: tag,
  }),
)

function ShiftHomeFromEdge() {
  const result = useAtomValue(catalogSnapshotAtom)
  const foreground = foregroundStateFromAtom(
    useAtomValue(foregroundSessionGateStateAtom),
  )
  // Render the REAL home composition (the same component the live route
  // renders) — not a static re-implementation. No coordinate owner is passed,
  // so this render-only object does not publish to the capture seam.
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

function isShiftPowerState(
  value: string | undefined,
): value is ShiftPowerState {
  return SHIFT_POWER_STATE_TAGS.includes(value as ShiftPowerState)
}

function powerStateFromBinding(
  binding: Readonly<Record<string, LabInputValue>>,
  fallback: LabInputValue | undefined,
): ShiftPowerState {
  const value =
    binding[SHIFT_POWER_INPUT_ID] ?? binding[LAB_VARIANT_INPUT_ID] ?? fallback
  return isShiftPowerState(value) ? value : DEFAULT_SHIFT_POWER_STATE
}

function clockFromBinding(
  binding: Readonly<Record<string, LabInputValue>>,
  fallback: LabInputValue | undefined,
): string {
  return shiftClockIsoForValue(
    binding[SHIFT_CLOCK_INPUT_ID] ??
      binding[LAB_VARIANT_INPUT_ID] ??
      fallback ??
      DEFAULT_SHIFT_CLOCK_ISO,
  )
}

function networkFromBinding(binding: Readonly<Record<string, LabInputValue>>) {
  return shiftNetworkStatusForValue(binding[SHIFT_NETWORK_INPUT_ID])
}

function renderShiftBatteryPart(state: ShiftPowerState): ReactNode {
  return (
    <ShiftPartFrame width={120} height={120}>
      <ShiftBattery {...shiftBatteryPropsForPowerState(state)} />
    </ShiftPartFrame>
  )
}

function renderShiftStatusBarPart({
  powerState,
  clock,
  network,
}: {
  readonly powerState: ShiftPowerState
  readonly clock: string
  readonly network: ReturnType<typeof shiftNetworkStatusForValue>
}): ReactNode {
  return (
    <ShiftPartFrame height={140}>
      <ShiftStatusBar
        time={shiftClockLabelForIso(clock)}
        avatarSrc="https://i.pravatar.cc/96?u=korri-shift-user"
        battery={shiftBatteryPropsForPowerState(powerState)}
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
    return renderShiftBatteryPart(
      powerStateFromBinding(binding.inputValues, story.state),
    )
  }

  if (isShiftStatusBarStory(story)) {
    return renderShiftStatusBarPart({
      powerState: powerStateFromBinding(binding.inputValues, story.state),
      clock: clockFromBinding(binding.inputValues, story.state),
      network: networkFromBinding(binding.inputValues),
    })
  }

  if (!isShiftHomeStory(story)) return story.render()

  const powerState = powerStateFromBinding(binding.inputValues, undefined)
  const clock = clockFromBinding(binding.inputValues, undefined)
  const network = networkFromBinding(binding.inputValues)
  const dataTag = binding.inputValues[LAB_VARIANT_INPUT_ID] ?? "Ready"
  const catalogLayer = shiftCatalogLayerForBinding(binding.sourceId, dataTag)
  const entries = shiftEntriesForBinding(binding.sourceId)
  const foregroundTag = binding.inputValues.foreground ?? "Ready"
  const makeForeground =
    shiftForegroundSourceLayers[
      foregroundTag as keyof typeof shiftForegroundSourceLayers
    ] ?? shiftForegroundSourceLayers.Ready
  // Key on every dial so changing one re-seeds — atom initial values only seed
  // on first render.
  return (
    <RegistryProvider
      key={`${binding.sourceId}:${dataTag}:${foregroundTag}:${powerState}:${clock}:${network}`}
      initialValues={[
        [catalogFactsSourceLayerAtom, catalogLayer],
        [foregroundSessionStatusLayerAtom, makeForeground()],
        [shiftPowerStateAtom, powerState],
        [shiftClockIsoAtom, clock],
        [shiftNetworkStatusAtom, network],
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
