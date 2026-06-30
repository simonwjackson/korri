import { type CSSProperties, useEffect, useState } from "react"
import { LabDeviceCluster } from "../components/LabDeviceCluster"
import { useLab } from "../Lab.context"
import { LabSurfaceMount } from "../LabSurfaceMount"
import {
  initialValuesForBinding,
  type LabInputValue,
} from "../model/lab-source-state"
import { useLabFitHeight } from "./useLabFitHeight"

let fallbackLabViewSessionId = 0

function createLabViewSessionId(): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return randomId
  fallbackLabViewSessionId += 1
  return `view-${fallbackLabViewSessionId}`
}

export function LabSurfaceView({
  sourceId,
  stateId,
}: {
  readonly sourceId: string
  readonly stateId: LabInputValue
}) {
  const {
    adapter,
    initialValues,
    selectedDevices,
    surfacePath,
    setSurfacePath,
    pxPerMm,
  } = useLab()
  const [viewSessionId] = useState(createLabViewSessionId)
  const maxHeightPx = useLabFitHeight()
  const [boundValues, setBoundValues] = useState<unknown | null>(initialValues)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!adapter.makeSeedInitialValuesForBinding) {
      setError(null)
      setBoundValues(initialValues)
      return
    }

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
  }, [adapter, initialValues, sourceId, stateId])

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
        const channelName = `lab:${viewSessionId}:${adapter.id}:${device.id}`
        const createChannel = adapter.createDualScreenChannel
        const dualScreenSession = createChannel
          ? { channelName, createChannel }
          : { channelName }
        const secondaryScreenPath = adapter.secondaryScreenPath ?? surfacePath
        const mountKey = adapter.makeSeedInitialValuesForBinding
          ? `${sourceId}:${stateId}`
          : "default-seed"
        return (
          <LabDeviceCluster
            key={device.id}
            device={device}
            pxPerMm={pxPerMm}
            maxHeightPx={maxHeightPx}
            renderPrimary={() => (
              <LabSurfaceMount
                key={mountKey}
                adapter={adapter}
                initialValues={boundValues}
                surfacePath={surfacePath}
                onNavigate={setSurfacePath}
                dualScreen={
                  hasMultipleScreens
                    ? { role: "primary", ...dualScreenSession }
                    : undefined
                }
              />
            )}
            renderSecondary={screen => (
              <LabSurfaceMount
                key={`${screen.id}:${mountKey}`}
                adapter={adapter}
                initialValues={boundValues}
                surfacePath={secondaryScreenPath}
                onNavigate={() => {}}
                dualScreen={{ role: "companion", ...dualScreenSession }}
              />
            )}
          />
        )
      })}
    </div>
  )
}
