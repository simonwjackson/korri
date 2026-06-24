import { useEffect, useMemo, useState } from "react"
import {
  normalizeSurfacePath,
  parseDeviceSegment,
  selectedDevicesForSegment,
} from "./lab-route-state"
import { LabContext } from "./Lab.context"
import { LabDevicePicker } from "./components/LabDevicePicker"
import { LabRouteBar } from "./components/LabRouteBar"
import { LabStage } from "./components/LabStage"
import { LabThemePicker } from "./components/LabThemePicker"
import { labSurfaceAdapters, type LabSurfaceAdapter } from "./surface-registry"

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
  const [error, setError] = useState<Error | null>(null)

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

  const context = useMemo(() => {
    if (!adapter || initialValues === null) return null

    const deviceIds = adapter.devices.map(device => device.id)
    const selection = parseDeviceSegment(routeState.devicesSegment, deviceIds)
    const selectedIds = new Set(
      selectedDevicesForSegment(routeState.devicesSegment, deviceIds),
    )
    const selectedDevices = adapter.devices.filter(device =>
      selectedIds.has(device.id),
    )

    return {
      adapter,
      initialValues,
      themeId: routeState.themeId,
      surfacePath: normalizeSurfacePath(routeState.surfacePath),
      selection,
      devices: adapter.devices,
      selectedDevices,
      setDevicesSegment: navigation.setDevicesSegment,
      setThemeId: navigation.setThemeId,
      setSurfacePath: (surfacePath: string) =>
        navigation.setSurfacePath(normalizeSurfacePath(surfacePath)),
    }
  }, [adapter, initialValues, navigation, routeState])

  if (error) {
    return (
      <div role="alert" className="lab-stage">
        Failed to load lab surface: {error.message}
      </div>
    )
  }

  if (!context) {
    return <div className="lab-stage">Loading lab…</div>
  }

  return (
    <LabContext.Provider value={context}>
      <LabDevicePicker />
      <LabRouteBar />
      <LabThemePicker adapters={adapters} />
      <LabStage />
    </LabContext.Provider>
  )
}
