import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { deviceScreens } from "../../device-lab"
import type { Story } from "../../types"
import { useLab } from "../Lab.context"
import {
  bindObjectInstance,
  clampScale,
  DEFAULT_CAMERA,
  type LabCamera,
  type LabObjectInstance,
  type LabWorkshopCommandSignal,
  type LabWorkshopTool,
} from "../model/lab-canvas-state"
import { LabDraggablePart } from "./LabDraggablePart"

/** Grid spacing for auto-placed / tidied cards — generous enough that a
 * device-framed handheld doesn't overlap its neighbour before you drag. */
const GRID_X = 540
const GRID_Y = 480

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest("input, textarea, select, button, [contenteditable=true]"),
  )
}

function zoomAtPoint(
  camera: LabCamera,
  nextScale: number,
  point: { readonly x: number; readonly y: number },
): LabCamera {
  const worldX = (point.x - camera.x) / camera.scale
  const worldY = (point.y - camera.y) / camera.scale
  return {
    x: point.x - worldX * nextScale,
    y: point.y - worldY * nextScale,
    scale: nextScale,
  }
}

export function LabWorkshopBoard({
  instances,
  stories,
  tool,
  command,
  screenId,
  selectedId,
  onSelect,
  onInstancesChange,
}: {
  readonly instances: readonly LabObjectInstance[]
  readonly stories: ReadonlyMap<string, Story>
  readonly tool: LabWorkshopTool
  readonly command: LabWorkshopCommandSignal | null
  /** Which logical screen aspect to render (multi-screen devices); null = first/default. */
  readonly screenId: string | null
  readonly selectedId: string | null
  readonly onSelect: (id: string | null) => void
  readonly onInstancesChange: (instances: readonly LabObjectInstance[]) => void
}) {
  const { selectedDevices } = useLab()
  const device = selectedDevices[0]
  const screens = device ? deviceScreens(device) : []
  const screen = screens.find(s => s.id === screenId) ?? screens[0]
  const [camera, setCamera] = useState<LabCamera>(DEFAULT_CAMERA)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const panRef = useRef<{
    readonly pointerId: number
    readonly x: number
    readonly y: number
    readonly cx: number
    readonly cy: number
  } | null>(null)

  const bind = (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId">>,
  ) => onInstancesChange(bindObjectInstance(instances, id, patch))
  const move = (id: string, x: number, y: number) =>
    onInstancesChange(bindObjectInstance(instances, id, { x, y }))
  const remove = (id: string) =>
    onInstancesChange(instances.filter(instance => instance.id !== id))

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isEditableTarget(event.target)) return
      event.preventDefault()
      setSpaceDown(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space") return
      event.preventDefault()
      setSpaceDown(false)
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      cx: camera.x,
      cy: camera.y,
    }
    setPanning(true)
  }

  const tidy = useCallback(
    () =>
      onInstancesChange(
        instances.map((instance, index) => ({
          ...instance,
          x: 24 + (index % 3) * GRID_X,
          y: 24 + Math.floor(index / 3) * GRID_Y,
        })),
      ),
    [instances, onInstancesChange],
  )
  const tidyRef = useRef(tidy)

  useEffect(() => {
    tidyRef.current = tidy
  }, [tidy])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return

    const wheel = (event: WheelEvent) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      const rect = board.getBoundingClientRect()
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      if (event.altKey || event.ctrlKey || event.metaKey) {
        setCamera(cam =>
          zoomAtPoint(
            cam,
            clampScale(cam.scale * Math.exp(-event.deltaY * 0.0015)),
            point,
          ),
        )
        return
      }
      setCamera(cam => ({
        ...cam,
        x: cam.x - event.deltaX,
        y: cam.y - event.deltaY,
      }))
    }

    board.addEventListener("wheel", wheel, { passive: false })
    return () => board.removeEventListener("wheel", wheel)
  })

  useEffect(() => {
    if (!command) return
    switch (command.command) {
      case "zoom-out":
        setCamera(cam => ({ ...cam, scale: clampScale(cam.scale / 1.2) }))
        break
      case "zoom-in":
        setCamera(cam => ({ ...cam, scale: clampScale(cam.scale * 1.2) }))
        break
      case "reset-view":
        setCamera(DEFAULT_CAMERA)
        break
      case "tidy":
        tidyRef.current()
        break
    }
  }, [command])

  return (
    <div
      ref={boardRef}
      className="pt-board-free"
      data-hand={spaceDown || tool === "hand" ? "true" : undefined}
      data-panning={panning ? "true" : undefined}
      onPointerDownCapture={event => {
        if (isEditableTarget(event.target)) return
        const panButton = event.button === 1
        if (!spaceDown && tool !== "hand" && !panButton) return
        startPan(event)
      }}
      onPointerDown={event => {
        if (event.target !== event.currentTarget) return
        // Clicking empty canvas clears the selection.
        onSelect(null)
        startPan(event)
      }}
      onPointerMove={event => {
        const pan = panRef.current
        if (!pan || pan.pointerId !== event.pointerId) return
        setCamera(cam => ({
          ...cam,
          x: pan.cx + event.clientX - pan.x,
          y: pan.cy + event.clientY - pan.y,
        }))
      }}
      onPointerUp={event => {
        const pan = panRef.current
        if (!pan || pan.pointerId !== event.pointerId) return
        event.currentTarget.releasePointerCapture(event.pointerId)
        panRef.current = null
        setPanning(false)
      }}
      onPointerCancel={event => {
        const pan = panRef.current
        if (!pan || pan.pointerId !== event.pointerId) return
        panRef.current = null
        setPanning(false)
      }}
    >
      <div
        className="pt-cam"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px)`,
          // Use layout zoom instead of transform scale so text is re-rendered at
          // the zoomed size rather than bitmap-scaled by the compositor.
          zoom: camera.scale,
        }}
      >
        {instances.map((instance, index) => {
          const story = stories.get(instance.storyId)
          if (!story) return null
          const positioned =
            instance.x === undefined
              ? {
                  ...instance,
                  x: 24 + (index % 3) * GRID_X,
                  y: 24 + Math.floor(index / 3) * GRID_Y,
                }
              : instance
          return (
            <LabDraggablePart
              key={instance.id}
              instance={positioned}
              story={story}
              byId={stories}
              screen={screen}
              scale={camera.scale}
              selected={instance.id === selectedId}
              onSelect={onSelect}
              onBind={bind}
              onMove={move}
              onRemove={remove}
            />
          )
        })}
      </div>
    </div>
  )
}
