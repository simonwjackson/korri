import { type CSSProperties, useEffect, useState } from "react"
import { LabDeviceCluster } from "../components/LabDeviceCluster"
import { useLab } from "../Lab.context"
import { LabSurfaceMount } from "../LabSurfaceMount"
import {
  initialValuesForBinding,
  type SourceStatus,
} from "../model/lab-source-state"

const VIEWPORT_INSET = 112

/**
 * A selected page part rendered as the live mounted surface at its route, on one
 * device. It consults the same production-inert preview singletons the routes
 * do, so the States panel's axis pins are reflected here without remounting; the
 * mount stays navigable, so "go live from here" falls out for free.
 */
export function LabScreenView({
  screenPath,
  sourceId,
  stateId,
}: {
  readonly screenPath: string
  readonly sourceId: string
  readonly stateId: SourceStatus
}) {
  const { adapter, selectedDevices, pxPerMm } = useLab()
  // `path` tracks internal navigation within a screen; `anchor` snaps it back to
  // the selected screen's route synchronously (no flash) when the selection
  // changes, before the keyed remount reads it.
  const [path, setPath] = useState(screenPath)
  const [anchor, setAnchor] = useState(screenPath)
  if (screenPath !== anchor) {
    setAnchor(screenPath)
    setPath(screenPath)
  }
  // Load the seed once (null until ready) so the surface mounts a single time;
  // axis pins then update it cross-root without a remount.
  const [boundValues, setBoundValues] = useState<unknown | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [maxHeightPx, setMaxHeightPx] = useState(() =>
    typeof window === "undefined"
      ? undefined
      : window.innerHeight - VIEWPORT_INSET,
  )

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

  const device = selectedDevices[0] ?? adapter.devices[0]
  if (!device)
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
      <LabDeviceCluster
        device={device}
        pxPerMm={pxPerMm}
        maxHeightPx={maxHeightPx}
        renderPrimary={() => (
          <LabSurfaceMount
            // Key by screenPath so selecting a different screen part remounts
            // crisply at the new route (no stale-screen flash); internal
            // navigation updates `path` without remounting.
            key={`${screenPath}:${sourceId}:${stateId}`}
            adapter={adapter}
            initialValues={boundValues}
            surfacePath={path}
            onNavigate={setPath}
          />
        )}
      />
    </div>
  )
}
