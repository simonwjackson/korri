import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import {
  activePreviewTarget,
  elementMatchesPreviewTarget,
  type LabPreviewSelection,
  previewSelectionFromEventTarget,
} from "../model/lab-preview-selection"

const LONG_PRESS_MS = 450

type OverlayRect = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export function LabInspectableContent({
  scopeId,
  pickMode,
  selection,
  onSelect,
  children,
}: {
  readonly scopeId: string
  readonly pickMode: boolean
  readonly selection: LabPreviewSelection | null
  readonly onSelect: (selection: LabPreviewSelection | null) => void
  readonly children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickRef = useRef(false)
  const [overlay, setOverlay] = useState<OverlayRect | null>(null)

  const clearLongPress = () => {
    if (!longPressTimerRef.current) return
    clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  const selectFromTarget = (target: EventTarget | null): boolean => {
    const next = previewSelectionFromEventTarget(target, scopeId)
    if (!next) return false
    onSelect(next)
    return true
  }

  const stopForInspect = (event: {
    preventDefault: () => void
    stopPropagation: () => void
  }) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handlePointerDownCapture = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (pickMode || event.altKey) {
      if (selectFromTarget(event.target)) stopForInspect(event)
      return
    }

    clearLongPress()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      if (selectFromTarget(event.target)) suppressClickRef.current = true
    }, LONG_PRESS_MS)
  }

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (pickMode || event.altKey) {
      if (selectFromTarget(event.target)) stopForInspect(event)
      return
    }
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      stopForInspect(event)
    }
  }

  useEffect(
    () => () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    },
    [],
  )

  useLayoutEffect(() => {
    const root = rootRef.current
    const target = activePreviewTarget(selection)
    if (!root || !selection || selection.scopeId !== scopeId || !target) {
      setOverlay(null)
      return
    }

    const measure = () => {
      const selected = Array.from(
        root.querySelectorAll<HTMLElement>("[data-korri-part]"),
      ).find(element => elementMatchesPreviewTarget(element, target))
      if (!selected) {
        setOverlay(null)
        return
      }
      const rootRect = root.getBoundingClientRect()
      const selectedRect = selected.getBoundingClientRect()
      setOverlay({
        left: selectedRect.left - rootRect.left,
        top: selectedRect.top - rootRect.top,
        width: selectedRect.width,
        height: selectedRect.height,
      })
    }

    measure()
    const frame = requestAnimationFrame(measure)
    window.addEventListener("resize", measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", measure)
    }
  }, [scopeId, selection])

  return (
    <div
      ref={rootRef}
      className="lab-inspectable-surface"
      data-preview-pick={pickMode || undefined}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerUpCapture={clearLongPress}
      onPointerCancelCapture={clearLongPress}
      onPointerLeave={clearLongPress}
      onClickCapture={handleClickCapture}
    >
      {children}
      {overlay ? (
        <div
          className="lab-preview-selection-ring"
          aria-hidden
          style={{
            left: overlay.left,
            top: overlay.top,
            width: overlay.width,
            height: overlay.height,
          }}
        />
      ) : null}
    </div>
  )
}
