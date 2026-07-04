import { type CSSProperties, type ReactNode, useRef } from "react"
import type { ScreenConfig } from "../../device-lab"
import { useLab } from "../Lab.context"
import {
  clampFrameWidth,
  deviceAspect,
  deviceFaceLabel,
  devicePresetWidth,
  setPreviewFrame,
  useLabPreviewFrame,
} from "../model/lab-preview-frame"

const DEFAULT_SCREEN = {
  id: "compose-screen",
  widthMm: 156,
  heightMm: 85,
} satisfies ScreenConfig

/**
 * Logical screen frame for Compose.
 *
 * Unlike `DeviceFrame`, this does not convert millimetres to pixels and it never
 * draws a bezel. The frame is user-sized: a device picker sets which device's
 * aspect it takes (or "Fit" = the part's own logical screen), and a corner
 * handle resizes its width freely. Both live in one shared, persisted setting
 * (`useLabPreviewFrame`), so resizing or switching device once moves every
 * placed part's preview together instead of each being stuck at one device size.
 */
export function LabScreenFrame({
  children,
  screen,
}: {
  readonly children: ReactNode
  readonly screen: ScreenConfig | undefined
}) {
  const { devices } = useLab()
  const frame = useLabPreviewFrame()
  const boxRef = useRef<HTMLDivElement>(null)

  const logical = screen ?? DEFAULT_SCREEN
  const activeDevice = frame.deviceId
    ? (devices.find(device => device.id === frame.deviceId) ?? null)
    : null

  const aspect = activeDevice
    ? deviceAspect(activeDevice)
    : logical.heightMm > 0
      ? logical.widthMm / logical.heightMm
      : 16 / 10

  const frameStyle = {
    width: `${frame.width}px`,
    aspectRatio: `${aspect}`,
  } as CSSProperties

  const onDevice = (value: string) => {
    if (!value) {
      setPreviewFrame({ deviceId: null })
      return
    }
    const device = devices.find(candidate => candidate.id === value)
    setPreviewFrame({
      deviceId: value,
      ...(device ? { width: devicePresetWidth(device) } : {}),
    })
  }

  // Resize by the pointer's position inside the frame box, converted back to
  // layout px via the box's own render scale, so it stays correct even when the
  // Compose board is zoomed/panned.
  const onResizeDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const box = boxRef.current
    if (!box) return
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const move = (next: PointerEvent) => {
      const rect = box.getBoundingClientRect()
      const renderScale = box.offsetWidth > 0 ? rect.width / box.offsetWidth : 1
      const layoutWidth = (next.clientX - rect.left) / (renderScale || 1)
      setPreviewFrame({ width: clampFrameWidth(layoutWidth) })
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
    <div className="lab-frame-shell" data-lab-frame="screen-shell">
      <div className="lab-frame-toolbar">
        <label className="lab-frame-device">
          <span className="lab-frame-device-caption">Frame</span>
          <select
            value={frame.deviceId ?? ""}
            onChange={event => onDevice(event.target.value)}
            aria-label="Preview frame device size"
          >
            <option value="">Fit to screen</option>
            {devices.map(device => (
              <option key={device.id} value={device.id}>
                {device.name} · {deviceFaceLabel(device)}
              </option>
            ))}
          </select>
        </label>
        <span className="lab-frame-width">{frame.width}px</span>
      </div>
      <div className="lab-frame-box" ref={boxRef}>
        <div
          className="lab-compose-screen-frame"
          data-lab-frame="screen"
          data-lab-screen-id={logical.id}
          style={frameStyle}
        >
          <div className="lab-compose-screen">{children}</div>
        </div>
        <button
          type="button"
          className="lab-frame-resize"
          aria-label="Resize preview frame"
          title="Drag to resize"
          onPointerDown={onResizeDown}
        />
      </div>
    </div>
  )
}
