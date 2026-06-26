import type { DeviceConfig, ThemeKnob } from "../../device-lab"

export type LabCalibrationController = {
  readonly setPxPerMm: (pxPerMm: number) => void
  readonly patchDevice: (id: string, next: Partial<DeviceConfig>) => void
  readonly addDevice: () => void
  readonly removeDevice: (id: string) => void
  readonly setKnob: (cssVar: string, value: number) => void
  readonly reset: () => void
  readonly storageKey: string
}

export function knobStyle(
  knobs: readonly ThemeKnob[],
  values: Readonly<Record<string, number>>,
): Record<string, string> {
  return Object.fromEntries(
    knobs.map(knob => [
      knob.cssVar,
      `${values[knob.cssVar] ?? knob.default}${knob.unit ?? ""}`,
    ]),
  )
}
