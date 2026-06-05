/**
 * device-lab — the calibration desk chrome.
 *
 * SCALE is global (per monitor): drag until the dashed box matches a real
 * credit card (ISO ID-1, 85.6 x 53.98 mm) held to the screen, fixing CSS px
 * per physical millimetre. Everything else is per device: physical size
 * (W x H mm) plus independent TEXT and PAD multipliers. `export` copies the
 * current values as NDJSON so they can be baked back in as defaults.
 */

const CARD_W_MM = 85.6
const CARD_H_MM = 53.98

export type DeviceCal = {
  readonly id: string
  readonly name: string
  readonly onNameChange: (next: string) => void
  readonly onRemove: () => void
  readonly mm: { readonly w: number; readonly h: number }
  readonly onMmChange: (next: { w: number; h: number }) => void
  readonly textPct: number
  readonly onTextChange: (next: number) => void
  readonly padPct: number
  readonly onPadChange: (next: number) => void
}

export function Calibrator({
  pxPerMm,
  onPxPerMmChange,
  devices,
  onAdd,
  onReset,
  storageKey,
}: {
  readonly pxPerMm: number
  readonly onPxPerMmChange: (next: number) => void
  readonly devices: readonly DeviceCal[]
  readonly onAdd: () => void
  readonly onReset: () => void
  /** Included in the exported NDJSON so values can be matched to a template. */
  readonly storageKey: string
}) {
  const dpi = Math.round(pxPerMm * 25.4)
  const exportNdjson = () => {
    const lines = [
      JSON.stringify({ scope: "global", storageKey, pxPerMm }),
      ...devices.map(device =>
        JSON.stringify({
          scope: "device",
          name: device.name,
          wMm: device.mm.w,
          hMm: device.mm.h,
          textPct: device.textPct,
          padPct: device.padPct,
        }),
      ),
    ]
    const text = lines.join("\n")
    void navigator.clipboard?.writeText?.(text)
    console.log(text)
    window.prompt("Calibration NDJSON (copied to clipboard):", text)
  }

  return (
    <div className="lab-calibrator">
      <div className="lab-cal-card-wrap">
        <div
          className="lab-cal-card"
          style={{ width: CARD_W_MM * pxPerMm, height: CARD_H_MM * pxPerMm }}
        >
          match a credit card
        </div>
        <div className="lab-cal-row">
          <span className="lab-label">SCALE</span>
          <input
            type="range"
            min={2.5}
            max={9}
            step={0.01}
            value={pxPerMm}
            aria-label="Calibrate scale to a credit card"
            onChange={event => onPxPerMmChange(Number(event.target.value))}
            className="lab-range"
          />
          <span className="lab-value">{dpi}dpi</span>
        </div>
      </div>

      {devices.map(device => (
        <div className="lab-cal-device" key={device.id}>
          <input
            type="text"
            value={device.name}
            aria-label="Device name"
            onChange={event => device.onNameChange(event.target.value)}
            className="lab-cal-name-input"
          />
          <MmField
            axis="W"
            value={device.mm.w}
            onChange={w => device.onMmChange({ w, h: device.mm.h })}
          />
          <MmField
            axis="H"
            value={device.mm.h}
            onChange={h => device.onMmChange({ w: device.mm.w, h })}
          />
          <span className="lab-label">TEXT</span>
          <input
            type="range"
            min={80}
            max={220}
            step={5}
            value={device.textPct}
            aria-label={`${device.name} text scale`}
            onChange={event => device.onTextChange(Number(event.target.value))}
            className="lab-range short"
          />
          <span className="lab-value">{device.textPct}%</span>
          <span className="lab-label">PAD</span>
          <input
            type="range"
            min={50}
            max={250}
            step={5}
            value={device.padPct}
            aria-label={`${device.name} padding scale`}
            onChange={event => device.onPadChange(Number(event.target.value))}
            className="lab-range short"
          />
          <span className="lab-value">{device.padPct}%</span>
          <button
            type="button"
            className="lab-cal-remove"
            aria-label={`Remove ${device.name}`}
            onClick={device.onRemove}
          >
            ×
          </button>
        </div>
      ))}

      <div className="lab-cal-row">
        <button type="button" className="lab-btn" onClick={onAdd}>
          + device
        </button>
        <button type="button" className="lab-btn" onClick={onReset}>
          reset
        </button>
        <button type="button" className="lab-btn" onClick={exportNdjson}>
          export
        </button>
      </div>
    </div>
  )
}

function MmField({
  axis,
  value,
  onChange,
}: {
  readonly axis: string
  readonly value: number
  readonly onChange: (next: number) => void
}) {
  return (
    <span className="lab-cal-mm">
      <span className="lab-cal-mm-label">{axis}</span>
      <input
        type="number"
        min={10}
        max={400}
        step={0.1}
        value={value}
        aria-label={`${axis} in millimetres`}
        onChange={event => {
          const next = Number(event.target.value)
          if (Number.isFinite(next) && next > 0) onChange(next)
        }}
        className="lab-cal-mm-input"
      />
      <span className="lab-cal-mm-unit">mm</span>
    </span>
  )
}
