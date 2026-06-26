import {
  type DeviceConfig,
  deviceScreens,
  type ScreenConfig,
  type ScreenPlacement,
} from "../../device-lab"
import { useLab } from "../Lab.context"

const PLACEMENTS: readonly ScreenPlacement[] = [
  "above",
  "below",
  "left",
  "right",
]

export function LabDevicesPanel() {
  const {
    devices,
    selectedDevices,
    pxPerMm,
    selection,
    setDevicesSegment,
    calibration,
  } = useLab()
  const selected = new Set(selectedDevices.map(device => device.id))

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDevicesSegment(
      next.size === devices.length || next.size === 0
        ? "all"
        : [...next].join(","),
    )
  }

  const writeScreens = (
    device: DeviceConfig,
    screens: readonly ScreenConfig[],
  ) => calibration.patchDevice(device.id, { screens })

  const patchScreen = (
    device: DeviceConfig,
    screenId: string,
    patch: Partial<ScreenConfig>,
  ) =>
    writeScreens(
      device,
      deviceScreens(device).map(screen =>
        screen.id === screenId ? { ...screen, ...patch } : screen,
      ),
    )

  const addScreen = (device: DeviceConfig) => {
    const screens = deviceScreens(device)
    const taken = new Set(screens.map(screen => screen.id))
    let n = screens.length + 1
    let id = `${device.id}-screen-${n}`
    while (taken.has(id)) {
      n += 1
      id = `${device.id}-screen-${n}`
    }
    const next: ScreenConfig = {
      id,
      label: `Screen ${screens.length + 1}`,
      widthMm: 110,
      heightMm: 62,
      role: "secondary",
      placement: "below",
    }
    writeScreens(device, [...screens, next])
  }

  const removeScreen = (device: DeviceConfig, screenId: string) =>
    writeScreens(
      device,
      deviceScreens(device).filter(screen => screen.id !== screenId),
    )

  return (
    <div className="pt-devices">
      <div className="pt-sources-hint">
        Physical-size device previews. Current selection: {selection.kind}
      </div>
      {devices.map(device => {
        const screens = deviceScreens(device)
        return (
          <div key={device.id} className="lab-device-card">
            <button
              type="button"
              className={`pt-device${selected.has(device.id) ? " is-on" : ""}`}
              onClick={() => toggle(device.id)}
            >
              <span className="pt-device-check" aria-hidden>
                {selected.has(device.id) ? "●" : "○"}
              </span>
              {device.name}
            </button>
            <div className="lab-screen-list">
              {screens.map((screen, index) => {
                const isPrimary = index === 0 || screen.role === "primary"
                return (
                  <div key={screen.id} className="lab-screen-row">
                    <span className="lab-screen-tag">
                      {isPrimary ? "main" : (screen.label ?? "screen")}
                    </span>
                    <label>
                      W
                      <input
                        type="number"
                        value={screen.widthMm}
                        onChange={event =>
                          patchScreen(device, screen.id, {
                            widthMm: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      H
                      <input
                        type="number"
                        value={screen.heightMm}
                        onChange={event =>
                          patchScreen(device, screen.id, {
                            heightMm: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    {isPrimary ? (
                      <span className="lab-screen-anchor">anchor</span>
                    ) : (
                      <>
                        <select
                          className="lab-screen-place"
                          aria-label="Placement"
                          value={screen.placement ?? "below"}
                          onChange={event =>
                            patchScreen(device, screen.id, {
                              placement: event.target.value as ScreenPlacement,
                            })
                          }
                        >
                          {PLACEMENTS.map(placement => (
                            <option key={placement} value={placement}>
                              {placement}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="lab-screen-remove"
                          aria-label="Remove screen"
                          onClick={() => removeScreen(device, screen.id)}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
              <button
                type="button"
                className="lab-screen-add"
                onClick={() => addScreen(device)}
              >
                + screen
              </button>
            </div>
          </div>
        )
      })}
      <label className="pt-knob">
        <div className="pt-knob-row">
          <span>Scale</span>
          <span className="pt-knob-val">{Math.round(pxPerMm * 25.4)}dpi</span>
        </div>
        <input
          type="range"
          min={2.5}
          max={9}
          step={0.01}
          value={pxPerMm}
          onChange={event => calibration.setPxPerMm(Number(event.target.value))}
        />
      </label>
      <div className="lab-panel-actions">
        <button type="button" onClick={calibration.addDevice}>
          + add device
        </button>
        <button type="button" onClick={calibration.reset}>
          Reset
        </button>
      </div>
    </div>
  )
}
