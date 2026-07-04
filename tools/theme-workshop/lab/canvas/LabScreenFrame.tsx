import { type CSSProperties, type ReactNode, useRef } from "react"
import { clampFrameWidth } from "../model/lab-preview-frame"

/**
 * Logical screen frame for Compose — just the sized content box plus a corner
 * resize handle. All chrome (device pick, resolution, title, actions) lives in
 * the floating dock shown when the part is active, so an idle part is only its
 * content frame floating in space. Sizing is computed by the parent and passed
 * as explicit px. The handle resizes THIS part:
 *  - plain drag → free rectangle resize (width and height independent);
 *  - Shift → keep the aspect ratio (uniform scale);
 *  - Alt → broadcast the size to every placed part.
 */
export function LabScreenFrame({
  children,
  width,
  height,
  screenId,
  onResize,
}: {
  readonly children: ReactNode
  readonly width: number
  readonly height: number
  readonly screenId?: string
  /** Resize this part to `width × height`; `broadcast` (Alt) resizes all parts. */
  readonly onResize?: (
    width: number,
    height: number,
    broadcast: boolean,
  ) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  const frameStyle = {
    width: `${width}px`,
    height: `${height}px`,
  } as CSSProperties

  // Resize by the pointer's position inside the frame box, converted back to
  // layout px via the box's own render scale, so it stays correct even when the
  // Compose board is zoomed/panned. Shift locks the aspect; Alt broadcasts.
  const onResizeDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const box = boxRef.current
    if (!box || !onResize) return
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startAspect = height > 0 ? width / height : 1
    const move = (next: PointerEvent) => {
      const rect = box.getBoundingClientRect()
      const renderScale = box.offsetWidth > 0 ? rect.width / box.offsetWidth : 1
      const scale = renderScale || 1
      const layoutWidth = (next.clientX - rect.left) / scale
      const layoutHeight = (next.clientY - rect.top) / scale
      if (next.shiftKey) {
        const nextWidth = clampFrameWidth(layoutWidth)
        onResize(
          nextWidth,
          clampFrameWidth(nextWidth / (startAspect || 1)),
          next.altKey,
        )
        return
      }
      onResize(
        clampFrameWidth(layoutWidth),
        clampFrameWidth(layoutHeight),
        next.altKey,
      )
    }
    const up = (next: PointerEvent) => {
      handle.releasePointerCapture(next.pointerId)
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", up)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up)
  }

  return (
    <div className="lab-frame-box" ref={boxRef}>
      <div
        className="lab-compose-screen-frame"
        data-lab-frame="screen"
        data-lab-screen-id={screenId}
        style={frameStyle}
      >
        <div className="lab-compose-screen">{children}</div>
      </div>
      <button
        type="button"
        className="lab-frame-resize"
        aria-label="Resize preview frame"
        title="Drag to resize · Shift = keep aspect · Alt = resize all"
        onPointerDown={onResizeDown}
      />
    </div>
  )
}
