/**
 * device-lab — the harness orchestrator.
 *
 * Owns the calibrated state (global pxPerMm, a runtime-editable device list, and
 * optional theme generator knobs) and persists the whole roster as one JSON blob
 * under `storageKey`, so adding / removing / renaming / resizing devices and
 * tuning generators all survive a reload. The design under test is supplied via
 * `render(device)`. Skinnable through *ClassName props and `scaleVarPrefix`; the
 * kit knows nothing of the template.
 */
import { type CSSProperties, type ReactNode, useEffect, useState } from "react"
import { Calibrator, type DeviceCal, type KnobCal } from "./Calibrator"
import { DeviceFrame } from "./DeviceFrame"
import type { DeviceConfig, ThemeKnob } from "./types"

const DEFAULT_PX_PER_MM = 3.7795275591 // CSS nominal 96dpi; recalibrate via card
const VIEWPORT_INSET = 48 // stage padding allowance for fit-to-height

type LabState = {
  readonly pxPerMm: number
  readonly devices: readonly DeviceConfig[]
  /** Theme generator knob values, keyed by cssVar. */
  readonly knobs: Record<string, number>
}

export function DeviceLab({
  storageKey,
  devices,
  render,
  themeKnobs = [],
  defaultPxPerMm = DEFAULT_PX_PER_MM,
  scaleVarPrefix = "lab",
  stageClassName,
  screensClassName,
  bezelClassName,
  screenClassName,
}: {
  /** localStorage namespace; keep distinct per template. */
  readonly storageKey: string
  /** Initial roster. The persisted blob takes over after first edit; `reset`
   * restores this set. */
  readonly devices: readonly DeviceConfig[]
  readonly render: (device: DeviceConfig) => ReactNode
  /** Optional theme-specific generator knobs (base size, ratio, space, ...). */
  readonly themeKnobs?: readonly ThemeKnob[]
  readonly defaultPxPerMm?: number
  readonly scaleVarPrefix?: string
  readonly stageClassName?: string
  readonly screensClassName?: string
  readonly bezelClassName?: string
  readonly screenClassName?: string
}) {
  const [state, setState] = useState<LabState>(() =>
    loadLab(storageKey, devices, themeKnobs, defaultPxPerMm),
  )
  useEffect(() => {
    saveLab(storageKey, state)
  }, [storageKey, state])

  // Device-size focus: null = show all frames (original), or a single device id.
  const [focusId, setFocusId] = useState<string | null>(null)

  // Oversized devices (a TV) scale down to fit the viewport height.
  const [maxHeightPx, setMaxHeightPx] = useState<number | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : window.innerHeight - VIEWPORT_INSET,
  )
  useEffect(() => {
    const update = () => setMaxHeightPx(window.innerHeight - VIEWPORT_INSET)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const setPxPerMm = (pxPerMm: number) =>
    setState(prev => ({ ...prev, pxPerMm }))
  const patchDevice = (id: string, next: Partial<DeviceConfig>) =>
    setState(prev => ({
      ...prev,
      devices: prev.devices.map(d => (d.id === id ? { ...d, ...next } : d)),
    }))
  const addDevice = () =>
    setState(prev => ({
      ...prev,
      devices: [...prev.devices, makeDevice(prev.devices)],
    }))
  const removeDevice = (id: string) =>
    setState(prev => ({
      ...prev,
      devices: prev.devices.filter(d => d.id !== id),
    }))
  const setKnob = (cssVar: string, value: number) =>
    setState(prev => ({ ...prev, knobs: { ...prev.knobs, [cssVar]: value } }))
  const reset = () =>
    setState({
      pxPerMm: defaultPxPerMm,
      devices: devices.map(d => ({ ...d })),
      knobs: knobDefaults(themeKnobs),
    })

  const cals: DeviceCal[] = state.devices.map(device => ({
    id: device.id,
    name: device.name,
    onNameChange: name => patchDevice(device.id, { name }),
    onRemove: () => removeDevice(device.id),
    mm: { w: device.widthMm, h: device.heightMm },
    onMmChange: mm => patchDevice(device.id, { widthMm: mm.w, heightMm: mm.h }),
    textPct: device.textPct,
    onTextChange: textPct => patchDevice(device.id, { textPct }),
    padPct: device.padPct,
    onPadChange: padPct => patchDevice(device.id, { padPct }),
  }))

  const knobCals: KnobCal[] = themeKnobs.map(knob => ({
    id: knob.id,
    label: knob.label,
    cssVar: knob.cssVar,
    value: state.knobs[knob.cssVar] ?? knob.default,
    min: knob.min,
    max: knob.max,
    step: knob.step,
    unit: knob.unit,
    onChange: value => setKnob(knob.cssVar, value),
  }))

  // Generator knobs cascade to every screen from the stage.
  const stageStyle = Object.fromEntries(
    themeKnobs.map(knob => [
      knob.cssVar,
      `${state.knobs[knob.cssVar] ?? knob.default}${knob.unit ?? ""}`,
    ]),
  ) as CSSProperties

  const shownDevices =
    focusId === null
      ? state.devices
      : state.devices.filter(device => device.id === focusId)

  return (
    <div className={cx("lab-stage", stageClassName)} style={stageStyle}>
      {state.devices.length > 1 ? (
        <div className="lab-focus">
          <button
            type="button"
            className={cx("lab-focus-tab", focusId === null ? "on" : undefined)}
            onClick={() => setFocusId(null)}
          >
            ALL
          </button>
          {state.devices.map(device => (
            <button
              key={device.id}
              type="button"
              className={cx(
                "lab-focus-tab",
                focusId === device.id ? "on" : undefined,
              )}
              onClick={() => setFocusId(device.id)}
            >
              {device.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className={cx("lab-screens", screensClassName)}>
        {shownDevices.map(device => (
          <DeviceFrame
            key={device.id}
            widthMm={device.widthMm}
            heightMm={device.heightMm}
            pxPerMm={state.pxPerMm}
            textScale={device.textPct / 100}
            padScale={device.padPct / 100}
            scaleVarPrefix={scaleVarPrefix}
            maxHeightPx={maxHeightPx}
            bezel={device.bezel}
            bezelClassName={bezelClassName}
            screenClassName={screenClassName}
          >
            {render(device)}
          </DeviceFrame>
        ))}
      </div>
      <Calibrator
        pxPerMm={state.pxPerMm}
        onPxPerMmChange={setPxPerMm}
        devices={cals}
        knobs={knobCals}
        onAdd={addDevice}
        onReset={reset}
        storageKey={storageKey}
      />
    </div>
  )
}

/** Append a fresh 16:9 device with a unique id and incrementing name. */
function makeDevice(existing: readonly DeviceConfig[]): DeviceConfig {
  const taken = new Set(existing.map(d => d.id))
  let n = existing.length + 1
  let id = `device-${n}`
  while (taken.has(id)) {
    n += 1
    id = `device-${n}`
  }
  return {
    id,
    name: `DEVICE ${existing.length + 1}`,
    widthMm: 100,
    heightMm: 56.25,
    textPct: 140,
    padPct: 100,
  }
}

function knobDefaults(
  themeKnobs: readonly ThemeKnob[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const knob of themeKnobs) out[knob.cssVar] = knob.default
  return out
}

function loadLab(
  storageKey: string,
  fallback: readonly DeviceConfig[],
  themeKnobs: readonly ThemeKnob[],
  defaultPxPerMm: number,
): LabState {
  const seeded: LabState = {
    pxPerMm: defaultPxPerMm,
    devices: fallback.map(d => ({ ...d })),
    knobs: knobDefaults(themeKnobs),
  }
  if (typeof window === "undefined") return seeded
  try {
    const raw = window.localStorage.getItem(`${storageKey}:lab`)
    if (!raw) return seeded
    const parsed = JSON.parse(raw) as Partial<LabState>
    if (!parsed || !Array.isArray(parsed.devices)) return seeded
    const devices = parsed.devices
      .map(normalizeDevice)
      .filter((d): d is DeviceConfig => d !== null)
    if (devices.length === 0) return seeded
    const pxPerMm = Number(parsed.pxPerMm)
    // Start from knob defaults, then overlay any persisted numeric values.
    const knobs = knobDefaults(themeKnobs)
    if (parsed.knobs && typeof parsed.knobs === "object") {
      for (const [key, value] of Object.entries(parsed.knobs)) {
        if (Number.isFinite(Number(value))) knobs[key] = Number(value)
      }
    }
    return {
      pxPerMm:
        Number.isFinite(pxPerMm) && pxPerMm > 0 ? pxPerMm : defaultPxPerMm,
      devices,
      knobs,
    }
  } catch {
    return seeded
  }
}

function saveLab(storageKey: string, state: LabState): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(`${storageKey}:lab`, JSON.stringify(state))
}

function normalizeDevice(value: unknown): DeviceConfig | null {
  if (typeof value !== "object" || value === null) return null
  const d = value as Record<string, unknown>
  const num = (v: unknown, fallback: number) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback
  if (typeof d.id !== "string") return null
  return {
    id: d.id,
    name: typeof d.name === "string" ? d.name : d.id,
    widthMm: num(d.widthMm, 100),
    heightMm: num(d.heightMm, 56.25),
    textPct: num(d.textPct, 140),
    padPct: num(d.padPct, 100),
    bezel: d.bezel !== false,
  }
}

const cx = (...classes: readonly (string | undefined)[]) =>
  classes.filter(Boolean).join(" ")
