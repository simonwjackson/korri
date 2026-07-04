import { GripVertical, Trash2 } from "lucide-react"
import type { DeviceConfig } from "../../device-lab"
import { deviceFaceLabel } from "../model/lab-preview-frame"

/**
 * Floating control strip for the active placed part. It replaces the persistent
 * header: an idle part is only its content frame, and everything else (identity,
 * frame device, resolution, take actions, close) surfaces here — separated but
 * close, next to the AI ask bar. The grip is the part's drag handle.
 */
export function LabObjectControls({
  name,
  layer,
  meta,
  deviceId,
  devices,
  width,
  height,
  canPromote,
  canDelete,
  onStartMove,
  onDeviceChange,
  onPromote,
  onDelete,
  onRemove,
}: {
  readonly name: string
  readonly layer: string
  readonly meta?: string | null
  readonly deviceId?: string | null
  readonly devices: readonly DeviceConfig[]
  readonly width: number
  readonly height: number
  readonly canPromote: boolean
  readonly canDelete: boolean
  readonly onStartMove: (event: React.PointerEvent<HTMLButtonElement>) => void
  readonly onDeviceChange: (deviceId: string | null) => void
  readonly onPromote: () => void
  readonly onDelete: () => void
  readonly onRemove: () => void
}) {
  return (
    <div
      className="lab-object-controls"
      role="toolbar"
      aria-label={`Controls for ${name}`}
    >
      <button
        type="button"
        className="lab-object-grip"
        aria-label={`Move ${name}`}
        title="Drag to move"
        onPointerDown={onStartMove}
      >
        <GripVertical size={14} aria-hidden />
      </button>
      <span className={`pt-layer-tag layer-${layer}`}>{layer}</span>
      <span className="lab-object-title">{name}</span>
      {meta ? <span className="pt-work-badge">{meta}</span> : null}
      <span className="lab-object-divider" aria-hidden />
      <label className="lab-object-device">
        <span className="lab-object-device-caption">Frame</span>
        <select
          value={deviceId ?? ""}
          onChange={event =>
            onDeviceChange(event.target.value ? event.target.value : null)
          }
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
      <span className="lab-object-res">
        {width}×{height}
      </span>
      <span className="lab-object-actions">
        {canPromote ? (
          <button
            type="button"
            className="pt-object-promote"
            aria-label={`Promote Take ${name}`}
            onClick={onPromote}
          >
            Promote
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            className="pt-object-remove"
            aria-label={`Delete Take ${name}`}
            onClick={onDelete}
          >
            <Trash2 size={13} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="pt-object-remove"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
        >
          ×
        </button>
      </span>
    </div>
  )
}
