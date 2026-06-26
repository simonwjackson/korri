import { useEffect, useMemo, useState } from "react"
import type { DeviceConfig, ThemeKnob } from "../device-lab"
import {
  normalizeSurfacePath,
  parseDeviceSegment,
  selectedDevicesForSegment,
} from "./lab-route-state"
import { LabContext } from "./Lab.context"
import { LabShell } from "./LabShell"
import { labSurfaceAdapters, type LabSurfaceAdapter } from "./surface-registry"

const DEFAULT_PX_PER_MM = 3.7795275591

/** Distinct from the legacy theme-workshop namespace so the real-app lab never
 * inherits the old workshop's persisted collapsed/closed calibrator state. */
const labStorageKey = (adapterId: string) => `lab-${adapterId}`

type LabCalibrationState = {
  readonly pxPerMm: number
  readonly devices: readonly DeviceConfig[]
  readonly knobs: Record<string, number>
}

export interface LabRouteState {
  readonly devicesSegment: string
  readonly themeId: string
  readonly surfacePath: string
}

export interface LabNavigation {
  readonly setDevicesSegment: (devicesSegment: string) => void
  readonly setThemeId: (themeId: string) => void
  readonly setSurfacePath: (surfacePath: string) => void
}

export function LabRoot({
  routeState,
  navigation,
  adapters = labSurfaceAdapters(),
}: {
  readonly routeState: LabRouteState
  readonly navigation: LabNavigation
  readonly adapters?: readonly LabSurfaceAdapter[]
}) {
  const adapter = adapters.find(
    candidate => candidate.id === routeState.themeId,
  )
  const [initialValues, setInitialValues] = useState<unknown>(null)
  const [calibration, setCalibration] = useState<LabCalibrationState | null>(
    null,
  )
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!adapter) {
      setCalibration(null)
      return
    }
    setCalibration(
      loadLab(
        labStorageKey(adapter.id),
        adapter.devices,
        adapter.knobs ?? [],
        adapter.defaultPxPerMm ?? DEFAULT_PX_PER_MM,
      ),
    )
  }, [adapter])

  useEffect(() => {
    if (!adapter || !calibration) return
    saveLab(labStorageKey(adapter.id), calibration)
  }, [adapter, calibration])

  useEffect(() => {
    let cancelled = false
    setInitialValues(null)
    setError(null)

    if (!adapter) {
      setError(new Error(`Unknown lab surface adapter ${routeState.themeId}`))
      return
    }

    void adapter
      .makeSeedInitialValues()
      .then(values => {
        if (!cancelled) setInitialValues(values)
      })
      .catch(cause => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)))
        }
      })

    return () => {
      cancelled = true
    }
  }, [adapter, routeState.themeId])

  const setPxPerMm = (pxPerMm: number) =>
    setCalibration(prev => (prev ? { ...prev, pxPerMm } : prev))
  const patchDevice = (id: string, next: Partial<DeviceConfig>) =>
    setCalibration(prev =>
      prev
        ? {
            ...prev,
            devices: prev.devices.map(device =>
              device.id === id ? { ...device, ...next } : device,
            ),
          }
        : prev,
    )
  const addDevice = () =>
    setCalibration(prev =>
      prev
        ? { ...prev, devices: [...prev.devices, makeDevice(prev.devices)] }
        : prev,
    )
  const removeDevice = (id: string) =>
    setCalibration(prev =>
      prev
        ? { ...prev, devices: prev.devices.filter(device => device.id !== id) }
        : prev,
    )
  const setKnob = (cssVar: string, value: number) =>
    setCalibration(prev =>
      prev ? { ...prev, knobs: { ...prev.knobs, [cssVar]: value } } : prev,
    )
  const reset = () => {
    if (!adapter) return
    setCalibration({
      pxPerMm: adapter.defaultPxPerMm ?? DEFAULT_PX_PER_MM,
      devices: adapter.devices.map(device => ({ ...device })),
      knobs: knobDefaults(adapter.knobs ?? []),
    })
  }

  const context = useMemo(() => {
    if (!adapter || initialValues === null || calibration === null) return null

    const deviceIds = calibration.devices.map(device => device.id)
    const selection = parseDeviceSegment(routeState.devicesSegment, deviceIds)
    const selectedIds = new Set(
      selectedDevicesForSegment(routeState.devicesSegment, deviceIds),
    )
    const selectedDevices = calibration.devices.filter(device =>
      selectedIds.has(device.id),
    )
    const requestedPath = normalizeSurfacePath(routeState.surfacePath)
    const partsAlias = requestedPath === "/parts"

    return {
      adapter,
      initialValues,
      themeId: routeState.themeId,
      surfacePath: partsAlias ? "/" : requestedPath,
      initialCanvasView: partsAlias ? "gallery" as const : "surface" as const,
      screens: adapter.screens ?? [],
      selection,
      devices: calibration.devices,
      selectedDevices,
      pxPerMm: calibration.pxPerMm,
      knobValues: calibration.knobs,
      calibration: {
        setPxPerMm,
        patchDevice,
        addDevice,
        removeDevice,
        setKnob,
        reset,
        storageKey: labStorageKey(adapter.id),
      },
      setDevicesSegment: navigation.setDevicesSegment,
      setThemeId: navigation.setThemeId,
      setSurfacePath: (surfacePath: string) =>
        navigation.setSurfacePath(normalizeSurfacePath(surfacePath)),
    }
  }, [adapter, calibration, initialValues, navigation, routeState])

  if (error) {
    return (
      <div role="alert" className="lab-stage">
        Failed to load lab surface: {error.message}
      </div>
    )
  }

  if (!context || !calibration || !adapter) {
    return <div className="lab-stage">Loading lab…</div>
  }

  return (
    <LabContext.Provider value={context}>
      <LabShell />
    </LabContext.Provider>
  )
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
): LabCalibrationState {
  const seeded: LabCalibrationState = {
    pxPerMm: defaultPxPerMm,
    devices: fallback.map(device => ({ ...device })),
    knobs: knobDefaults(themeKnobs),
  }
  if (typeof window === "undefined") return seeded
  try {
    const raw = window.localStorage.getItem(`${storageKey}:lab`)
    if (!raw) return seeded
    const parsed = JSON.parse(raw) as Partial<LabCalibrationState>
    if (!parsed || !Array.isArray(parsed.devices)) return seeded
    const codeById = new Map(fallback.map(device => [device.id, device]))
    const devices = parsed.devices
      .map(normalizeDevice)
      .filter((device): device is DeviceConfig => device !== null)
      .map(device => {
        // Saved calibration only carries user-tunable values (sizes, bezel).
        // Structural fields like `screens` live in code, so a persisted device
        // inherits them from its code counterpart by id — otherwise adding
        // screens in config would be shadowed by an older saved state.
        const code = codeById.get(device.id)
        return code ? { ...device, screens: code.screens } : device
      })
    if (devices.length === 0) return seeded
    const pxPerMm = Number(parsed.pxPerMm)
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

function saveLab(storageKey: string, state: LabCalibrationState): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(`${storageKey}:lab`, JSON.stringify(state))
}

function normalizeDevice(value: unknown): DeviceConfig | null {
  if (typeof value !== "object" || value === null) return null
  const device = value as Record<string, unknown>
  const num = (candidate: unknown, fallback: number) =>
    Number.isFinite(Number(candidate)) && Number(candidate) > 0
      ? Number(candidate)
      : fallback
  if (typeof device.id !== "string") return null
  return {
    id: device.id,
    name: typeof device.name === "string" ? device.name : device.id,
    widthMm: num(device.widthMm, 100),
    heightMm: num(device.heightMm, 56.25),
    bezel: device.bezel !== false,
  }
}

function makeDevice(existing: readonly DeviceConfig[]): DeviceConfig {
  const taken = new Set(existing.map(device => device.id))
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
  }
}
