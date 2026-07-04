import { type CSSProperties, useEffect, useRef, useState } from "react"
import { LabDeviceCluster } from "../components/LabDeviceCluster"
import { useLab } from "../Lab.context"
import { normalizeSurfacePath } from "../lab-route-state"
import { LabFrameIdentity } from "./LabFrameIdentity"
import type { LabLiveDeviceObject } from "../model/lab-canvas-object"
import type { LabPreviewSelection } from "../model/lab-preview-selection"
import {
  initialValuesForBinding,
  type LabInputValue,
} from "../model/lab-source-state"
import { LabInspectableSurfaceMount } from "./LabInspectableSurfaceMount"
import { useLabFitHeight } from "./useLabFitHeight"

const NO_MIRROR = () => {}

let fallbackLabDeviceSessionId = 0

function createLabDeviceSessionId(): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return randomId
  fallbackLabDeviceSessionId += 1
  return `device-${fallbackLabDeviceSessionId}`
}

export function LabCanvasDevice({
  object,
  scale,
  selected,
  sourceId,
  stateId,
  pickMode,
  innerSelection,
  onSelect,
  onInnerSelect,
  onMove,
  onMeasure,
}: {
  readonly object: LabLiveDeviceObject
  readonly scale: number
  readonly selected: boolean
  readonly sourceId: string
  readonly stateId: LabInputValue
  readonly pickMode: boolean
  readonly innerSelection: LabPreviewSelection | null
  readonly onSelect: (id: string) => void
  readonly onInnerSelect: (selection: LabPreviewSelection | null) => void
  readonly onMove: (id: string, x: number, y: number) => void
  readonly onMeasure: (
    id: string,
    size: { readonly w: number; readonly h: number },
  ) => void
}) {
  const {
    adapter,
    devices,
    initialValues,
    surfacePath,
    setSurfacePath,
    synced,
    pxPerMm,
  } = useLab()
  const device = devices.find(candidate => candidate.id === object.deviceId)
  const [viewSessionId] = useState(createLabDeviceSessionId)
  const [frameRoute, setFrameRoute] = useState<{
    readonly path: string
    readonly search: string
  }>(() => ({ path: normalizeSurfacePath(surfacePath), search: "" }))
  const maxHeightPx = useLabFitHeight()
  const [boundValues, setBoundValues] = useState<unknown | null>(initialValues)
  const [error, setError] = useState<Error | null>(null)
  const ref = useRef<HTMLFieldSetElement | null>(null)
  const x = object.x ?? 24
  const y = object.y ?? 24

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

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        onMeasure(object.id, { w: rect.width / scale, h: rect.height / scale })
      }
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [object.id, onMeasure, scale])

  if (!device) return null

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
    <fieldset
      ref={ref}
      className={`pt-object lab-canvas-device${selected ? " is-selected" : ""}`}
      style={{ left: x, top: y, "--lab-px-per-mm": pxPerMm } as CSSProperties}
      onPointerDownCapture={() => onSelect(object.id)}
    >
      <header
        className="pt-object-bar"
        onPointerDown={event => {
          const start = { x: event.clientX, y: event.clientY, ox: x, oy: y }
          const target = event.currentTarget
          target.setPointerCapture(event.pointerId)
          const move = (next: PointerEvent) =>
            onMove(
              object.id,
              start.ox + (next.clientX - start.x) / scale,
              start.oy + (next.clientY - start.y) / scale,
            )
          const up = (next: PointerEvent) => {
            target.releasePointerCapture(next.pointerId)
            target.removeEventListener("pointermove", move)
            target.removeEventListener("pointerup", up)
          }
          target.addEventListener("pointermove", move)
          target.addEventListener("pointerup", up)
        }}
      >
        <span className="pt-layer-tag layer-page">device</span>
        <span className="pt-object-title">{device.name}</span>
        {synced === false ? (
          <LabFrameIdentity path={frameRoute.path} search={frameRoute.search} />
        ) : null}
      </header>
      <div className="pt-object-body lab-canvas-device-body">
        {error ? (
          <div role="alert" className="lab-empty-state">
            Failed to prepare fixture: {error.message}
          </div>
        ) : boundValues === null ? (
          <div className="lab-empty-state">Preparing fixture…</div>
        ) : (
          <LabDeviceCluster
            device={device}
            pxPerMm={pxPerMm}
            maxHeightPx={maxHeightPx}
            renderPrimary={() => (
              <LabInspectableSurfaceMount
                key={mountKey}
                scopeId={object.id}
                adapter={adapter}
                initialValues={boundValues}
                surfacePath={surfacePath}
                // Synced (default): a frame's navigation bubbles up and mirrors
                // to every frame. Un-synced: it stays local to this frame, so
                // devices can diverge.
                onNavigate={synced === false ? NO_MIRROR : setSurfacePath}
                onLocationChange={setFrameRoute}
                pickMode={pickMode}
                selection={innerSelection}
                onSelect={onInnerSelect}
                dualScreen={
                  hasMultipleScreens
                    ? { role: "primary", ...dualScreenSession }
                    : undefined
                }
              />
            )}
            renderSecondary={screen => (
              <LabInspectableSurfaceMount
                key={`${screen.id}:${mountKey}`}
                scopeId={object.id}
                adapter={adapter}
                initialValues={boundValues}
                surfacePath={secondaryScreenPath}
                onNavigate={() => {}}
                pickMode={pickMode}
                selection={innerSelection}
                onSelect={onInnerSelect}
                dualScreen={{ role: "companion", ...dualScreenSession }}
              />
            )}
          />
        )}
      </div>
    </fieldset>
  )
}
