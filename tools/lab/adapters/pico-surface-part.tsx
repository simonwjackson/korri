import { deviceStateAtom } from "@platform/react/device/device-atoms"
import { picoGames } from "@product/surfaces/web/pico/fixtures"
import { PicoStatusBarLive } from "@product/surfaces/web/pico/PicoStatusBar"
import {
  DEFAULT_PICO_CLOCK_ISO,
  PICO_CLOCK_PRESETS,
  picoClockIsoAtom,
  picoClockIsoForValue,
} from "@product/surfaces/web/pico/pico-clock-state"
import {
  DEFAULT_PICO_NETWORK_READING,
  type PicoNetworkReading,
  picoNetworkReadingAtom,
  picoNetworkReadingForValue,
} from "@product/surfaces/web/pico/pico-network-state"
import {
  DEFAULT_PICO_POWER_READING,
  type PicoPowerReading,
  picoDeviceStateForPowerReading,
  picoPowerReadingForValue,
} from "@product/surfaces/web/pico/pico-power-state"
import { VariantCartridgeShelf } from "@product/surfaces/web/pico/VariantCartridgeShelf"
import { VariantGameDetail } from "@product/surfaces/web/pico/VariantGameDetail"
import type { ReactNode } from "react"
import type { Story } from "@simonwjackson/caliper"
import type {
  LabInputControl,
  LabInputValue,
} from "@simonwjackson/caliper/adapter-kit"
import type { LabSurfacePartMountSpec } from "@simonwjackson/caliper"

/**
 * Live-mount specs and static renders for placed Pico parts. Parts whose
 * subtree reads real device-fact atoms (Status Bar, and the Home / Game Detail
 * page parts that embed it) get a binding→atoms projection consumed by
 * `LabPartMount`; every other part renders through its baked story render.
 * Mirrors shift-surface-part.tsx.
 */

export const PICO_POWER_INPUT_ID = "power"
export const PICO_CLOCK_INPUT_ID = "clock"
export const PICO_NETWORK_INPUT_ID = "network"

export const PICO_POWER_INPUT_CONTROL: LabInputControl = {
  kind: "object",
  fields: [
    {
      id: "percent",
      label: "Battery",
      defaultValue: DEFAULT_PICO_POWER_READING.percent,
      control: { kind: "range", min: 0, max: 100, step: 1, unit: "%" },
    },
    {
      id: "charging",
      label: "Charging",
      defaultValue: DEFAULT_PICO_POWER_READING.charging,
      control: { kind: "boolean" },
    },
  ],
}

export const PICO_CLOCK_INPUT_CONTROL: LabInputControl = {
  kind: "iso-datetime",
  options: PICO_CLOCK_PRESETS,
}

export const PICO_NETWORK_INPUT_CONTROL: LabInputControl = {
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
            DEFAULT_PICO_NETWORK_READING._tag === "Connected"
              ? DEFAULT_PICO_NETWORK_READING.strengthPercent
              : 80,
          control: { kind: "range", min: 0, max: 100, step: 1, unit: "%" },
        },
      ],
    },
  ],
}

export function isPicoStatusBarStory(story: Story): boolean {
  return story.layer === "molecule" && story.name === "Status Bar"
}

export function isPicoHomeStory(story: Story): boolean {
  return story.layer === "page" && story.name === "Home"
}

export function isPicoGameDetailStory(story: Story): boolean {
  return story.layer === "page" && story.name === "Game Detail"
}

/** Parts whose real subtree consumes device facts (all embed the status bar). */
export function isPicoDeviceFactStory(story: Story): boolean {
  return (
    isPicoStatusBarStory(story) ||
    isPicoHomeStory(story) ||
    isPicoGameDetailStory(story)
  )
}

function powerFromBinding(
  binding: Readonly<Record<string, LabInputValue>>,
): PicoPowerReading {
  return picoPowerReadingForValue(binding[PICO_POWER_INPUT_ID])
}

function clockFromBinding(
  binding: Readonly<Record<string, LabInputValue>>,
): string {
  return picoClockIsoForValue(
    typeof binding[PICO_CLOCK_INPUT_ID] === "string"
      ? (binding[PICO_CLOCK_INPUT_ID] as string)
      : DEFAULT_PICO_CLOCK_ISO,
  )
}

function networkFromBinding(
  binding: Readonly<Record<string, LabInputValue>>,
): PicoNetworkReading {
  return picoNetworkReadingForValue(binding[PICO_NETWORK_INPUT_ID])
}

function deviceFactSeed(binding: Readonly<Record<string, LabInputValue>>): {
  readonly initialValues: LabSurfacePartMountSpec["initialValues"]
  readonly reseedKeys: readonly string[]
} {
  const power = powerFromBinding(binding)
  const clock = clockFromBinding(binding)
  const network = networkFromBinding(binding)
  const powerKey = `power:${JSON.stringify(power)}`
  const initialValues = [
    [deviceStateAtom, picoDeviceStateForPowerReading(power)],
    [picoClockIsoAtom, clock],
    [picoNetworkReadingAtom, network],
  ] as const
  return {
    initialValues:
      initialValues as unknown as LabSurfacePartMountSpec["initialValues"],
    reseedKeys: [
      powerKey,
      `clock:${clock}`,
      `network:${JSON.stringify(network)}`,
    ],
  }
}

/**
 * The binding→atoms projection for the live device-fact parts: seed the shared
 * device-fact atoms the part's embedded status bar reads. The Home / Game
 * Detail screens are prop-driven by `games`; only their status bar consumes
 * atoms, so the fixture games are passed directly.
 */
export function picoSurfacePartMount(
  story: Story,
  binding: {
    readonly sourceId: string
    readonly inputValues: Readonly<Record<string, LabInputValue>>
  },
): LabSurfacePartMountSpec | null {
  if (!isPicoDeviceFactStory(story)) return null
  const seed = deviceFactSeed(binding.inputValues)
  const node: ReactNode = isPicoStatusBarStory(story) ? (
    <PicoStatusBarLive label="PICO" />
  ) : isPicoHomeStory(story) ? (
    <VariantCartridgeShelf games={picoGames} />
  ) : (
    <VariantGameDetail games={picoGames} />
  )
  return {
    initialValues: seed.initialValues,
    reseedKeys: seed.reseedKeys,
    node,
  }
}

/** Static render path for prop-driven placed parts (everything else). */
export function renderPicoSurfacePart(
  story: Story,
  _binding: {
    readonly sourceId: string
    readonly inputValues: Readonly<Record<string, LabInputValue>>
  },
): ReactNode {
  return story.render()
}
