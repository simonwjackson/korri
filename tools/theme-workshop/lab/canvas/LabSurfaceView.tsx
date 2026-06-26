import { type CSSProperties, useEffect, useState } from "react"
import { LabDeviceCluster } from "../components/LabDeviceCluster"
import { useLab } from "../Lab.context"
import { LabSurfaceMount } from "../LabSurfaceMount"
import {
  initialValuesForBinding,
  type SourceStatus,
} from "../model/lab-source-state"
import type { LabSurfaceAdapter } from "../surface-registry"

const VIEWPORT_INSET = 112

/** Route a secondary screen mounts at by default until per-screen routing
 * lands. Game detail makes it visibly a distinct surface from the primary's
 * home, proving "any surface/route per screen" with live content. */
const SECONDARY_INITIAL_PATH = "/game/hollow-knight"

/**
 * A secondary screen's surface. It's a second, fully independent mount that
 * shares only the bound data with the primary (each mount has its own router
 * and registry), so it navigates on its own without driving the primary's
 * route. This is the lab's stand-in for a real per-device companion surface.
 */
function LabSecondaryScreen({
  adapter,
  initialValues,
}: {
  readonly adapter: LabSurfaceAdapter
  readonly initialValues: unknown
}) {
  const [path, setPath] = useState(SECONDARY_INITIAL_PATH)
  return (
    <LabSurfaceMount
      adapter={adapter}
      initialValues={initialValues}
      surfacePath={path}
      onNavigate={setPath}
    />
  )
}

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
      {selectedDevices.map(device => (
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
            />
          )}
          renderSecondary={screen => (
            <LabSecondaryScreen
              key={`${screen.id}:${sourceId}:${stateId}`}
              adapter={adapter}
              initialValues={boundValues}
            />
          )}
        />
      ))}
    </div>
  )
}
