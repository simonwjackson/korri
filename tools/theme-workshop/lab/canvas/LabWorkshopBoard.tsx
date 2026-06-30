import { useRef, useState } from "react"
import type { Story } from "../../types"
import { bindObjectInstance, clampScale, DEFAULT_CAMERA, type LabCamera, type LabObjectInstance } from "../model/lab-canvas-state"
import type { LabSourceOption, LabStateOption } from "../model/lab-source-state"
import { LabDraggablePart } from "./LabDraggablePart"

export function LabCanvasBoard({
  instances,
  stories,
  sources,
  states,
  onInstancesChange,
}: {
  readonly instances: readonly LabObjectInstance[]
  readonly stories: ReadonlyMap<string, Story>
  readonly sources: readonly LabSourceOption[]
  readonly states: readonly LabStateOption[]
  readonly onInstancesChange: (instances: readonly LabObjectInstance[]) => void
}) {
  const [camera, setCamera] = useState<LabCamera>(DEFAULT_CAMERA)
  const panRef = useRef<{ readonly x: number; readonly y: number; readonly cx: number; readonly cy: number } | null>(null)

  const bind = (id: string, patch: Partial<Pick<LabObjectInstance, "sourceId" | "stateId">>) =>
    onInstancesChange(bindObjectInstance(instances, id, patch))
  const move = (id: string, x: number, y: number) =>
    onInstancesChange(bindObjectInstance(instances, id, { x, y }))
  const remove = (id: string) => onInstancesChange(instances.filter(instance => instance.id !== id))
  const tidy = () => onInstancesChange(instances.map((instance, index) => ({ ...instance, x: 24 + (index % 3) * 360, y: 24 + Math.floor(index / 3) * 300 })))

  if (instances.length === 0) return <div className="lab-empty-state">Turn on Multi and pick parts, or select several parts to lay them out here.</div>

  return (
    <div
      className="pt-board-free"
      onWheel={event => {
        event.preventDefault()
        setCamera(cam => ({ ...cam, scale: clampScale(cam.scale * Math.exp(-event.deltaY * 0.0015)) }))
      }}
      onPointerDown={event => {
        if (event.target !== event.currentTarget) return
        event.currentTarget.setPointerCapture(event.pointerId)
        panRef.current = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y }
      }}
      onPointerMove={event => {
        if (!panRef.current) return
        setCamera(cam => ({ ...cam, x: panRef.current!.cx + event.clientX - panRef.current!.x, y: panRef.current!.cy + event.clientY - panRef.current!.y }))
      }}
      onPointerUp={event => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        panRef.current = null
      }}
    >
      <div className="pt-cam" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        {instances.map((instance, index) => {
          const story = stories.get(instance.storyId)
          if (!story) return null
          const positioned = instance.x === undefined ? { ...instance, x: 24 + (index % 3) * 360, y: 24 + Math.floor(index / 3) * 300 } : instance
          return <LabDraggablePart key={instance.id} instance={positioned} story={story} byId={stories} sources={sources} states={states} scale={camera.scale} onBind={bind} onMove={move} onRemove={remove} />
        })}
      </div>
      <div className="pt-board-tools">
        <button type="button" aria-label="Zoom out" onClick={() => setCamera(cam => ({ ...cam, scale: clampScale(cam.scale / 1.2) }))}>−</button>
        <span className="pt-board-zoom">{Math.round(camera.scale * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => setCamera(cam => ({ ...cam, scale: clampScale(cam.scale * 1.2) }))}>+</button>
        <span className="pt-board-tools-sep" />
        <button type="button" onClick={() => setCamera(DEFAULT_CAMERA)}>100%</button>
        <button type="button" onClick={tidy}>Tidy</button>
      </div>
    </div>
  )
}
