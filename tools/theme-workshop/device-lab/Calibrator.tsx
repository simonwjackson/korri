/**
 * device-lab — the calibration desk chrome.
 *
 * Idle, it collapses to a single near-invisible toggle so it stays out of the
 * way. Open, it is a compact tabbed panel:
 *   - Devices    — per-device size (mm), add / remove / rename
 *   - Scale      — the monitor calibration: drag SCALE until the dashed box
 *                  matches a real credit card (ISO ID-1, 85.6 x 53.98 mm). The
 *                  true-size target only appears while this tab is active.
 *   - Generators — the theme's scale knobs (base, ratio, space, ...)
 * `export` copies the current values as NDJSON to bake back in as defaults.
 */
import { useState } from "react"

const CARD_W_MM = 85.6
const CARD_H_MM = 53.98

export type KnobCal = {
  readonly id: string
  readonly label: string
  readonly cssVar: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly unit?: string
  readonly onChange: (next: number) => void
}

export type DeviceCal = {
  readonly id: string
  readonly name: string
  readonly onNameChange: (next: string) => void
  readonly onRemove: () => void
  readonly mm: { readonly w: number; readonly h: number }
  readonly onMmChange: (next: { w: number; h: number }) => void
}

export function Calibrator({
  pxPerMm,
  onPxPerMmChange,
  devices,
  knobs,
  onAdd,
  onReset,
  storageKey,
}: {
  readonly pxPerMm: number
  readonly onPxPerMmChange: (next: number) => void
  readonly devices: readonly DeviceCal[]
  readonly knobs: readonly KnobCal[]
  readonly onAdd: () => void
  readonly onReset: () => void
  /** Included in the exported NDJSON so values can be matched to a template. */
  readonly storageKey: string
}) {
  const [open, setOpen] = useLocal(`${storageKey}:cal-open`, "1")
  const [tab, setTab] = useLocal(`${storageKey}:cal-tab`, "devices")
  const isOpen = open === "1"
  const hasKnobs = knobs.length > 0
  const activeTab = tab === "generators" && !hasKnobs ? "devices" : tab
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
        }),
      ),
      ...knobs.map(knob =>
        JSON.stringify({
          scope: "knob",
          cssVar: knob.cssVar,
          value: knob.value,
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
      {!isOpen && (
        <button
          type="button"
          className="lab-fab"
          aria-label="Open calibration desk"
          aria-expanded={false}
          onClick={() => setOpen("1")}
        >
          {"\u2699"}
        </button>
      )}

      {isOpen && (
        <div className="lab-panel" role="dialog" aria-label="Calibration desk">
          <div className="lab-panel-head">
            <div className="lab-tabs" role="tablist">
              <Tab id="devices" active={activeTab} onSelect={setTab}>
                Devices
              </Tab>
              <Tab id="scale" active={activeTab} onSelect={setTab}>
                Scale
              </Tab>
              {hasKnobs && (
                <Tab id="generators" active={activeTab} onSelect={setTab}>
                  Generators
                </Tab>
              )}
            </div>
            <button
              type="button"
              className="lab-fab lab-fab-close"
              aria-label="Close calibration desk"
              onClick={() => setOpen("0")}
            >
              {"\u00d7"}
            </button>
          </div>

          <div className="lab-panel-body">
            {activeTab === "devices" && (
              <div className="lab-section">
                {devices.map(device => (
                  <div className="lab-device" key={device.id}>
                    <div className="lab-device-head">
                      <input
                        type="text"
                        className="lab-device-name"
                        aria-label="Device name"
                        value={device.name}
                        onChange={e => device.onNameChange(e.target.value)}
                      />
                      <button
                        type="button"
                        className="lab-remove"
                        aria-label={`Remove ${device.name}`}
                        onClick={device.onRemove}
                      >
                        {"\u00d7"}
                      </button>
                    </div>
                    <div className="lab-mm-row">
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
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="lab-btn lab-add"
                  onClick={onAdd}
                >
                  + add device
                </button>
              </div>
            )}

            {activeTab === "scale" && (
              <div className="lab-section">
                <p className="lab-hint">
                  Hold a real credit card to the dashed box and drag SCALE until
                  they match. Calibrates this monitor once.
                </p>
                <Slider
                  label="SCALE"
                  value={pxPerMm}
                  min={2.5}
                  max={9}
                  step={0.01}
                  format={() => `${dpi}dpi`}
                  onChange={onPxPerMmChange}
                />
              </div>
            )}

            {activeTab === "generators" && hasKnobs && (
              <div className="lab-section">
                <p className="lab-hint">
                  The scale&apos;s character. Bake the settled values into the
                  theme CSS once happy.
                </p>
                {knobs.map(knob => (
                  <Slider
                    key={knob.id}
                    label={knob.label}
                    value={knob.value}
                    min={knob.min}
                    max={knob.max}
                    step={knob.step}
                    suffix={knob.unit ?? ""}
                    onChange={knob.onChange}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="lab-panel-footer">
            <button type="button" className="lab-btn" onClick={onReset}>
              reset all
            </button>
            <button type="button" className="lab-btn" onClick={exportNdjson}>
              export
            </button>
          </div>
        </div>
      )}

      {isOpen && activeTab === "scale" && (
        <div
          className="lab-card-overlay"
          aria-hidden="true"
          style={{ width: CARD_W_MM * pxPerMm, height: CARD_H_MM * pxPerMm }}
        >
          match a credit card
        </div>
      )}
    </div>
  )
}

function Tab({
  id,
  active,
  onSelect,
  children,
}: {
  readonly id: string
  readonly active: string
  readonly onSelect: (id: string) => void
  readonly children: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active === id}
      className="lab-tab"
      data-active={active === id || undefined}
      onClick={() => onSelect(id)}
    >
      {children}
    </button>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  format,
  onChange,
}: {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly suffix?: string
  readonly format?: (value: number) => string
  readonly onChange: (next: number) => void
}) {
  return (
    <label className="lab-field">
      <span className="lab-label">{label}</span>
      <input
        type="range"
        className="lab-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={event => onChange(Number(event.target.value))}
      />
      <span className="lab-value">
        {format ? format(value) : `${value}${suffix}`}
      </span>
    </label>
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
    <span className="lab-mm">
      <span className="lab-mm-label">{axis}</span>
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
        className="lab-mm-input"
      />
      <span className="lab-mm-unit">mm</span>
    </span>
  )
}

function useLocal(
  key: string,
  fallback: string,
): [string, (next: string) => void] {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined") return fallback
    return window.localStorage.getItem(key) ?? fallback
  })
  const change = (next: string) => {
    setValue(next)
    if (typeof window !== "undefined") window.localStorage.setItem(key, next)
  }
  return [value, change]
}
