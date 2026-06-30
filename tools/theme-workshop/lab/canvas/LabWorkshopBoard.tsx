import {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { deviceScreens } from "../../device-lab"
import type { Story } from "../../types"
import { useLab } from "../Lab.context"
import {
  PLACEMENT_CELL,
  placementAnchor,
  placeNext,
  type Rect,
  repackPositions,
} from "../model/lab-canvas-placement"
import {
  bindObjectInstance,
  cameraSettled,
  clampScale,
  DEFAULT_CAMERA,
  frameCameraOn,
  isRectFullyVisible,
  type LabCamera,
  type LabObjectInstance,
  type LabWorkshopCommandSignal,
  type LabWorkshopTool,
  lerpCamera,
} from "../model/lab-canvas-state"
import { useLabPlacementPattern } from "../model/lab-placement-store"
import { LabDraggablePart } from "./LabDraggablePart"

/** How quickly the camera eases toward its target each frame (0..1). */
const TWEEN_FACTOR = 0.2

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

function instanceRect(instance: LabObjectInstance): Rect {
  return {
    x: instance.x ?? 0,
    y: instance.y ?? 0,
    w: PLACEMENT_CELL.w,
    h: PLACEMENT_CELL.h,
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
  readonly onInstancesChange: Dispatch<
    SetStateAction<readonly LabObjectInstance[]>
  >
}) {
  const { selectedDevices } = useLab()
  const pattern = useLabPlacementPattern()
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

  // Mirror the live camera in a ref so the rAF tween reads the latest value
  // without re-subscribing each frame.
  const cameraRef = useRef(camera)
  useEffect(() => {
    cameraRef.current = camera
  }, [camera])
  const targetRef = useRef<LabCamera | null>(null)
  const rafRef = useRef<number | null>(null)

  const stopTween = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    targetRef.current = null
  }, [])

  // Eased pan/zoom toward a target camera. Direct manipulation (pan/zoom/wheel)
  // cancels any active tween so the user is never fighting the animation.
  const animateTo = useCallback((target: LabCamera) => {
    // No rAF (test env) or no smooth path: jump straight to the target.
    if (typeof requestAnimationFrame === "undefined") {
      cameraRef.current = target
      setCamera(target)
      return
    }
    targetRef.current = target
    if (rafRef.current != null) return
    const tick = () => {
      const next = targetRef.current
      if (!next) {
        rafRef.current = null
        return
      }
      const stepped = lerpCamera(cameraRef.current, next, TWEEN_FACTOR)
      if (cameraSettled(stepped, next)) {
        cameraRef.current = next
        setCamera(next)
        targetRef.current = null
        rafRef.current = null
        return
      }
      cameraRef.current = stepped
      setCamera(stepped)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => stopTween, [stopTween])

  const viewport = useCallback(() => {
    const rect = boardRef.current?.getBoundingClientRect()
    return { w: rect?.width ?? 0, h: rect?.height ?? 0 }
  }, [])

  const worldAnchor = useCallback((): { x: number; y: number } => {
    const view = viewport()
    const cam = cameraRef.current
    return {
      x: (view.w / 2 - cam.x) / cam.scale,
      y: (view.h / 2 - cam.y) / cam.scale,
    }
  }, [viewport])

  // Touching a card (select or drag) is direct manipulation: cancel any in-
  // flight place/select tween so the camera never fights the pointer.
  const handleSelect = (id: string | null) => {
    stopTween()
    onSelect(id)
  }
  const bind = (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId">>,
  ) => onInstancesChange(prev => bindObjectInstance(prev, id, patch))
  const move = (id: string, x: number, y: number) => {
    stopTween()
    onInstancesChange(prev => bindObjectInstance(prev, id, { x, y }))
  }
  const remove = (id: string) =>
    onInstancesChange(prev => prev.filter(instance => instance.id !== id))

  // Assign a real, persisted position to freshly placed parts using the chosen
  // pattern, then ease the camera to frame the last one. Persisting the spot
  // (rather than deriving it from list index) keeps cards put when siblings are
  // removed and gives the camera a stable target.
  useEffect(() => {
    const pending = instances.filter(instance => instance.x === undefined)
    if (pending.length === 0) return
    const occupied: Rect[] = instances
      .filter(instance => instance.x !== undefined)
      .map(instanceRect)
    // Spiral rings around the existing cluster's centre (stable as the camera
    // follows placements); grid/empty place where the user is looking.
    const anchor = placementAnchor(pattern, occupied, worldAnchor())
    const placements = new Map<string, { x: number; y: number }>()
    for (const instance of pending) {
      const point = placeNext(pattern, occupied, anchor, PLACEMENT_CELL)
      placements.set(instance.id, point)
      occupied.push({ ...point, w: PLACEMENT_CELL.w, h: PLACEMENT_CELL.h })
    }
    // Merge against the latest state (not this render's snapshot) and only patch
    // ids still present and still unpositioned, so a concurrent remove/move/tidy
    // is never clobbered.
    onInstancesChange(prev =>
      prev.map(instance => {
        const point = placements.get(instance.id)
        return point && instance.x === undefined
          ? { ...instance, ...point }
          : instance
      }),
    )
    const last = pending[pending.length - 1]
    const point = last ? placements.get(last.id) : undefined
    if (point) {
      animateTo(
        frameCameraOn(
          cameraRef.current,
          { ...point, w: PLACEMENT_CELL.w, h: PLACEMENT_CELL.h },
          viewport(),
        ),
      )
    }
  }, [instances, pattern, onInstancesChange, worldAnchor, viewport, animateTo])

  // Frame the selected object only when it isn't already fully on screen, so
  // clicking a visible card to drag it never yanks the camera. Depends only on
  // the selection id so dragging (which mutates instances) doesn't retarget.
  // biome-ignore lint/correctness/useExhaustiveDependencies: framing reads instances/viewport on demand; only a selection change should retarget.
  useEffect(() => {
    if (!selectedId) return
    const instance = instances.find(item => item.id === selectedId)
    if (!instance || instance.x === undefined) return
    const rect = instanceRect(instance)
    const view = viewport()
    if (isRectFullyVisible(cameraRef.current, rect, view, 24)) return
    animateTo(frameCameraOn(cameraRef.current, rect, view))
  }, [selectedId])

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
    stopTween()
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      cx: cameraRef.current.x,
      cy: cameraRef.current.y,
    }
    setPanning(true)
  }

  const tidy = useCallback(() => {
    const anchor = worldAnchor()
    onInstancesChange(prev => {
      const positions = repackPositions(
        pattern,
        prev.length,
        anchor,
        PLACEMENT_CELL,
      )
      return prev.map((instance, index) => ({
        ...instance,
        ...(positions[index] ?? { x: instance.x, y: instance.y }),
      }))
    })
  }, [onInstancesChange, pattern, worldAnchor])
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
      stopTween()
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
        stopTween()
        setCamera(cam => ({ ...cam, scale: clampScale(cam.scale / 1.2) }))
        break
      case "zoom-in":
        stopTween()
        setCamera(cam => ({ ...cam, scale: clampScale(cam.scale * 1.2) }))
        break
      case "reset-view":
        animateTo(DEFAULT_CAMERA)
        break
      case "tidy":
        tidyRef.current()
        break
    }
  }, [command, stopTween, animateTo])

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
        handleSelect(null)
        startPan(event)
      }}
      onPointerMove={event => {
        const pan = panRef.current
        if (!pan || pan.pointerId !== event.pointerId) return
        const next = {
          x: pan.cx + event.clientX - pan.x,
          y: pan.cy + event.clientY - pan.y,
        }
        setCamera(cam => ({ ...cam, ...next }))
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
                  x: 24 + (index % 3) * PLACEMENT_CELL.w,
                  y: 24 + Math.floor(index / 3) * PLACEMENT_CELL.h,
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
              onSelect={handleSelect}
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
