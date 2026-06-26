import { type CSSProperties, useEffect, useState } from "react"
import { DeviceFrame } from "../../device-lab"
import { useLab } from "../Lab.context"
import { LabSurfaceMount } from "../LabSurfaceMount"
import { initialValuesForBinding, type SourceStatus } from "../model/lab-source-state"

const VIEWPORT_INSET = 112

export function LabSurfaceView({ sourceId, stateId }: { readonly sourceId: string; readonly stateId: SourceStatus }) {
  const { adapter, initialValues, selectedDevices, surfacePath, setSurfacePath, pxPerMm } = useLab()
  const [maxHeightPx, setMaxHeightPx] = useState(() => typeof window === "undefined" ? undefined : window.innerHeight - VIEWPORT_INSET)
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
      .then(values => { if (!cancelled) setBoundValues(values) })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause : new Error(String(cause))) })
    return () => { cancelled = true }
  }, [adapter, sourceId, stateId])

  if (selectedDevices.length === 0) return <div className="lab-empty-state">Turn on a device in the Devices panel.</div>
  if (error) return <div role="alert" className="lab-empty-state">Failed to prepare fixture: {error.message}</div>
  if (boundValues === null) return <div className="lab-empty-state">Preparing fixture…</div>

  return (
    <div className="lab-surface-view" style={{ "--lab-px-per-mm": pxPerMm } as CSSProperties}>
      {selectedDevices.map(device => (
        <div key={device.id} data-lab-device-id={device.id}>
          <DeviceFrame widthMm={device.widthMm} heightMm={device.heightMm} pxPerMm={pxPerMm} maxHeightPx={maxHeightPx} bezel={device.bezel}>
            <LabSurfaceMount key={`${sourceId}:${stateId}`} adapter={adapter} initialValues={boundValues} surfacePath={surfacePath} onNavigate={setSurfacePath} />
          </DeviceFrame>
        </div>
      ))}
    </div>
  )
}
