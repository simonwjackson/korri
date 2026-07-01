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
import type { LabDesignPassStoryMeta } from "../design-pass/design-pass-model"
import { useLab } from "../Lab.context"
import {
  bindPlacedPartObject,
  isLiveDeviceObject,
  isPlacedPartObject,
  type LabCanvasObject,
  moveCanvasObject,
  objectBounds,
  updateLiveDeviceObjectSize,
} from "../model/lab-canvas-object"
import {
  PLACEMENT_CELL,
  placementAnchor,
  placeNext,
  type Rect,
} from "../model/lab-canvas-placement"
import {
  cameraSettled,
  clampScale,
  DEFAULT_CAMERA,
  frameCameraOn,
  isRectFullyVisible,
  type LabCamera,
  type LabWorkshopCommandSignal,
  type LabWorkshopTool,
  lerpCamera,
} from "../model/lab-canvas-state"
import { useLabPlacementPattern } from "../model/lab-placement-store"
import type { LabPreviewSelection } from "../model/lab-preview-selection"
import { LabCanvasDevice } from "./LabCanvasDevice"
import { LabDraggablePart } from "./LabDraggablePart"

/** How quickly the camera eases toward its target each frame (0..1). */
const TWEEN_FACTOR = 0.2
const EMPTY_DESIGN_PASS_META: ReadonlyMap<string, LabDesignPassStoryMeta> =
  new Map()

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

function fallbackRect(object: LabCanvasObject): Rect {
  return objectBounds(object)
}

export function LabWorkshopBoard({
  objects,
  stories,
  designPassMetaById = EMPTY_DESIGN_PASS_META,
  tool,
  command,
  screenId,
  selectedId,
  pickMode,
  innerSelection,
  onSelect,
  onInnerSelect,
  sourceId,
  stateId,
  onObjectsChange,
  onDeleteTake,
  onPromoteTake,
  onGenerateTakes,
}: {
  readonly objects: readonly LabCanvasObject[]
  readonly stories: ReadonlyMap<string, Story>
  readonly designPassMetaById?: ReadonlyMap<string, LabDesignPassStoryMeta>
  readonly tool: LabWorkshopTool
  readonly command: LabWorkshopCommandSignal | null
  /** Which logical screen aspect to render (multi-screen devices); null = first/default. */
  readonly screenId: string | null
  readonly selectedId: string | null
  readonly pickMode: boolean
  readonly innerSelection: LabPreviewSelection | null
  readonly onSelect: (id: string | null) => void
  readonly onInnerSelect: (selection: LabPreviewSelection | null) => void
  readonly sourceId: string
  readonly stateId: import("../model/lab-source-state").LabInputValue
  readonly onObjectsChange: Dispatch<SetStateAction<readonly LabCanvasObject[]>>
  readonly onDeleteTake?: (storyId: string) => void
  readonly onPromoteTake?: (storyId: string) => void
  readonly onGenerateTakes?: (
    id: string,
    request: { readonly prompt: string; readonly count: number },
  ) => void
}) {
  const pattern = useLabPlacementPattern()
  const { selectedDevices } = useLab()
  const activeDevice = selectedDevices[0]
  const screens = activeDevice ? deviceScreens(activeDevice) : []
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
    patch: Partial<import("../model/lab-canvas-object").LabPlacedPartObject>,
  ) => onObjectsChange(prev => bindPlacedPartObject(prev, id, patch))
  const move = (id: string, x: number, y: number) => {
    stopTween()
    onObjectsChange(prev => moveCanvasObject(prev, id, x, y))
  }
  const remove = (id: string) =>
    onObjectsChange(prev => prev.filter(object => object.id !== id))
  const measure = useCallback(
    (id: string, size: { readonly w: number; readonly h: number }) =>
      onObjectsChange(prev => updateLiveDeviceObjectSize(prev, id, size)),
    [onObjectsChange],
  )

  // Assign a real, persisted position to freshly placed parts using the chosen
  // pattern, then ease the camera to frame the last one. Persisting the spot
  // (rather than deriving it from list index) keeps cards put when siblings are
  // removed and gives the camera a stable target.
  useEffect(() => {
    const pending = objects.filter(object => object.x === undefined)
    if (pending.length === 0) return
    const occupied: Rect[] = objects
      .filter(object => object.x !== undefined)
      .map(fallbackRect)
    // Spiral rings around the existing cluster's centre (stable as the camera
    // follows placements); grid/empty place where the user is looking.
    const anchor = placementAnchor(pattern, occupied, worldAnchor())
    const placements = new Map<string, { x: number; y: number }>()
    for (const object of pending) {
      const size = objectBounds(object)
      const point = placeNext(pattern, occupied, anchor, {
        w: size.w,
        h: size.h,
      })
      placements.set(object.id, point)
      occupied.push({ ...point, w: size.w, h: size.h })
    }
    // Merge against the latest state (not this render's snapshot) and only patch
    // ids still present and still unpositioned, so a concurrent remove/move/tidy
    // is never clobbered.
    onObjectsChange(prev =>
      prev.map(object => {
        const point = placements.get(object.id)
        return point && object.x === undefined
          ? { ...object, ...point }
          : object
      }),
    )
    const last = pending[pending.length - 1]
    const point = last ? placements.get(last.id) : undefined
    if (last && point) {
      const size = objectBounds(last)
      animateTo(
        frameCameraOn(
          cameraRef.current,
          { ...point, w: size.w, h: size.h },
          viewport(),
        ),
      )
    }
  }, [objects, pattern, onObjectsChange, worldAnchor, viewport, animateTo])

  // Frame the selected object only when it isn't already fully on screen, so
  // clicking a visible card to drag it never yanks the camera. Depends only on
  // the selection id so dragging (which mutates instances) doesn't retarget.
  // biome-ignore lint/correctness/useExhaustiveDependencies: framing reads instances/viewport on demand; only a selection change should retarget.
  useEffect(() => {
    if (!selectedId) return
    const object = objects.find(item => item.id === selectedId)
    if (!object || object.x === undefined) return
    const rect = objectBounds(object)
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
    onObjectsChange(prev => {
      const occupied: Rect[] = []
      return prev.map(object => {
        const size = objectBounds(object)
        const point = placeNext(pattern, occupied, anchor, {
          w: size.w,
          h: size.h,
        })
        occupied.push({ ...point, w: size.w, h: size.h })
        return { ...object, ...point }
      })
    })
  }, [onObjectsChange, pattern, worldAnchor])
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
        if (pickMode) {
          stopTween()
          onInnerSelect(null)
          return
        }
        // Clicking empty canvas clears the workspace-object selection.
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
        {objects.map((object, index) => {
          const positioned =
            object.x === undefined
              ? {
                  ...object,
                  x: 24 + (index % 3) * PLACEMENT_CELL.w,
                  y: 24 + Math.floor(index / 3) * PLACEMENT_CELL.h,
                }
              : object
          if (isLiveDeviceObject(positioned)) {
            return (
              <LabCanvasDevice
                key={positioned.id}
                object={positioned}
                scale={camera.scale}
                selected={positioned.id === selectedId}
                sourceId={sourceId}
                stateId={stateId}
                pickMode={pickMode}
                innerSelection={innerSelection}
                onSelect={handleSelect}
                onInnerSelect={onInnerSelect}
                onMove={move}
                onMeasure={measure}
              />
            )
          }
          if (!isPlacedPartObject(positioned)) return null
          const story = stories.get(positioned.storyId)
          if (!story) return null
          return (
            <LabDraggablePart
              key={positioned.id}
              instance={positioned}
              story={story}
              storyMeta={designPassMetaById.get(story.id)}
              byId={stories}
              screen={screen}
              scale={camera.scale}
              selected={positioned.id === selectedId}
              pickMode={pickMode}
              innerSelection={innerSelection}
              onSelect={handleSelect}
              onInnerSelect={onInnerSelect}
              onBind={bind}
              onMove={move}
              onRemove={remove}
              onDeleteTake={onDeleteTake}
              onPromoteTake={onPromoteTake}
              onGenerateTakes={onGenerateTakes ?? (() => undefined)}
            />
          )
        })}
      </div>
    </div>
  )
}
