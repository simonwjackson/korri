import { type CSSProperties, useEffect, useState } from "react"
import { LabDeviceCluster } from "../components/LabDeviceCluster"
import { useLab } from "../Lab.context"
import { LabSurfaceMount } from "../LabSurfaceMount"
import {
  initialValuesForBinding,
  type SourceStatus,
} from "../model/lab-source-state"

const VIEWPORT_INSET = 112
const COMPANION_SURFACE_PATH = "/companion"

export function LabSurfaceView({
  sourceId,
  stateId,
}: {
  readonly sourceId: string
  readonly stateId: SourceStatus
}) {
  const {
    adapter,
    initialValues,
    selectedDevices,
    surfacePath,
    setSurfacePath,
    pxPerMm,
  } = useLab()
  const [maxHeightPx, setMaxHeightPx] = useState(() =>
    typeof window === "undefined"
      ? undefined
      : window.innerHeight - VIEWPORT_INSET,
  )
  const [boundValues, setBoundValues] = useState<unknown | null>(initialValues)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const update = () => setMaxHeightPx(window.innerHeight - VIEWPORT_INSET)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    setBoundValues(null)
    void initialValuesForBinding(adapter, { sourceId, stateId })
      .then(values => {
        if (!cancelled) setBoundValues(values)
      })
      .catch(cause => {
        if (!cancelled)
          setError(cause instanceof Error ? cause : new Error(String(cause)))
      })
    return () => {
      cancelled = true
    }
  }, [adapter, sourceId, stateId])

  if (selectedDevices.length === 0)
    return (
      <div className="lab-empty-state">
        Turn on a device in the Devices panel.
      </div>
    )
  if (error)
    return (
      <div role="alert" className="lab-empty-state">
        Failed to prepare fixture: {error.message}
      </div>
    )
  if (boundValues === null)
    return <div className="lab-empty-state">Preparing fixture…</div>

  return (
    <div
      className="lab-surface-view"
      style={{ "--lab-px-per-mm": pxPerMm } as CSSProperties}
    >
      {selectedDevices.map(device => {
        const hasMultipleScreens = (device.screens?.length ?? 0) > 1
        const channelName = `lab:${adapter.id}:${device.id}`
        return (
          <LabDeviceCluster
            key={device.id}
            device={device}
            pxPerMm={pxPerMm}
            maxHeightPx={maxHeightPx}
            renderPrimary={() => (
              <LabSurfaceMount
                key={`${sourceId}:${stateId}`}
                adapter={adapter}
                initialValues={boundValues}
                surfacePath={surfacePath}
                onNavigate={setSurfacePath}
                dualScreen={
                  hasMultipleScreens
                    ? { role: "primary", channelName }
                    : undefined
                }
              />
            )}
            renderSecondary={screen => (
              <LabSurfaceMount
                key={`${screen.id}:${sourceId}:${stateId}`}
                adapter={adapter}
                initialValues={boundValues}
                surfacePath={COMPANION_SURFACE_PATH}
                onNavigate={() => {}}
                dualScreen={{ role: "companion", channelName }}
              />
            )}
          />
        )
      })}
    </div>
  )
}
