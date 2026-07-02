/**
 * pico surface.
 * Variant B — Settings: category list on the left, the selected category's
 * controls (toggle / option cycler / slider / info) on the right. The
 * list+detail pattern suits settings far better than a game library, so games
 * get the richer cartridge (A) and icon-grid (C) treatments instead.
 */
import { useState } from "react"
import { PicoButtonBar, PicoStatusBarLive } from "./PicoStatusBar"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "./pico-design-parts"

type Control =
  | { readonly kind: "toggle"; readonly state: "on" | "off" }
  | { readonly kind: "option"; readonly value: string }
  | { readonly kind: "slider"; readonly level: number; readonly max: number }
  | { readonly kind: "info"; readonly value: string }

type SettingItem = { readonly label: string; readonly control: Control }
type SettingCategory = {
  readonly id: string
  readonly name: string
  readonly items: readonly SettingItem[]
}

const CATEGORIES: readonly SettingCategory[] = [
  {
    id: "display",
    name: "DISPLAY",
    items: [
      { label: "Brightness", control: { kind: "slider", level: 6, max: 10 } },
      { label: "Color Mode", control: { kind: "option", value: "VIVID" } },
      { label: "Scanlines", control: { kind: "toggle", state: "on" } },
      { label: "Integer Scale", control: { kind: "toggle", state: "on" } },
    ],
  },
  {
    id: "audio",
    name: "AUDIO",
    items: [
      { label: "Volume", control: { kind: "slider", level: 7, max: 10 } },
      { label: "UI Sounds", control: { kind: "toggle", state: "on" } },
      { label: "Mute on Sleep", control: { kind: "toggle", state: "off" } },
    ],
  },
  {
    id: "network",
    name: "NETWORK",
    items: [
      { label: "Wi-Fi", control: { kind: "toggle", state: "on" } },
      { label: "Network", control: { kind: "info", value: "PICO-NET" } },
      { label: "IP Address", control: { kind: "info", value: "192.168.1.42" } },
    ],
  },
  {
    id: "controllers",
    name: "CONTROLLERS",
    items: [
      { label: "Button Layout", control: { kind: "option", value: "SNES" } },
      { label: "Vibration", control: { kind: "toggle", state: "on" } },
      {
        label: "Stick Deadzone",
        control: { kind: "slider", level: 3, max: 10 },
      },
    ],
  },
  {
    id: "power",
    name: "POWER",
    items: [
      { label: "Sleep After", control: { kind: "option", value: "5 MIN" } },
      { label: "Battery Saver", control: { kind: "toggle", state: "off" } },
      { label: "Battery", control: { kind: "info", value: "82%" } },
    ],
  },
  {
    id: "system",
    name: "SYSTEM",
    items: [
      { label: "Language", control: { kind: "option", value: "ENGLISH" } },
      { label: "Time Zone", control: { kind: "option", value: "UTC-5" } },
      { label: "Auto-Update", control: { kind: "toggle", state: "on" } },
    ],
  },
  {
    id: "about",
    name: "ABOUT",
    items: [
      { label: "Firmware", control: { kind: "info", value: "v2.4.1" } },
      { label: "Storage", control: { kind: "info", value: "26 / 64 GB" } },
      { label: "Device", control: { kind: "info", value: "RG353M" } },
    ],
  },
]

export function VariantSettings() {
  const [cat, setCat] = useState(0)
  const [item, setItem] = useState(0)
  const active = CATEGORIES[cat]
  if (!active) return null

  return (
    <div className="pcB" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcB)}>
      <PicoStatusBarLive label="PICO ▸ SETTINGS" />
      <div
        className="pcB-body"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBBody)}
      >
        <div
          className="pcB-list"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBList)}
        >
          {CATEGORIES.map((category, index) => (
            <button
              type="button"
              key={category.id}
              className={`pcB-row ${index === cat ? "sel" : ""}`}
              onClick={() => {
                setCat(index)
                setItem(0)
              }}
              style={rowReset}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBRow)}
            >
              <span
                className="pcB-cursor"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBCursor)}
              >
                ▶
              </span>
              <span style={ellipsis}>{category.name}</span>
            </button>
          ))}
        </div>
        <div
          className="pcB-detail"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBDetail)}
        >
          <div
            className="pcB-detail-title"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBDetailTitle)}
          >
            {active.name}
          </div>
          {active.items.map((setting, index) => (
            <button
              type="button"
              key={setting.label}
              className={`pcB-set ${index === item ? "focused" : ""}`}
              onClick={() => setItem(index)}
              style={rowReset}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBSet)}
            >
              <span
                className="pcB-set-label"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBSetLabel)}
              >
                {setting.label}
              </span>
              <ControlView control={setting.control} />
            </button>
          ))}
        </div>
      </div>
      <PicoButtonBar
        hints={[
          { key: "a", label: "SELECT" },
          { key: "y", label: "DEFAULTS" },
          { key: "b", label: "BACK" },
        ]}
      />
    </div>
  )
}

function ControlView({ control }: { readonly control: Control }) {
  if (control.kind === "toggle") {
    return (
      <span
        className="pcB-toggle"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBToggle)}
      >
        <span className={control.state === "on" ? "on" : ""}>ON</span>
        <span className={control.state === "off" ? "on" : ""}>OFF</span>
      </span>
    )
  }
  if (control.kind === "option") {
    return (
      <span
        className="pcB-opt"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBOpt)}
      >
        <span
          className="pcB-opt-arr"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBOptArr)}
        >
          ◂
        </span>
        {control.value}
        <span
          className="pcB-opt-arr"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBOptArr)}
        >
          ▸
        </span>
      </span>
    )
  }
  if (control.kind === "slider") {
    return (
      <span
        className="pcB-bar"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBBar)}
      >
        <span
          className="pcB-bar-on"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBBarOn)}
        >
          {"█".repeat(control.level)}
        </span>
        <span
          className="pcB-bar-off"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBBarOff)}
        >
          {"░".repeat(Math.max(0, control.max - control.level))}
        </span>
      </span>
    )
  }
  return (
    <span
      className="pcB-info"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcBInfo)}
    >
      {control.value}
    </span>
  )
}

const rowReset: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  cursor: "pointer",
  border: "none",
  // Inherit the family only; the .pcB-row / .pcB-set classes own font-size
  // (token scale). A `font: inherit` shorthand would reset font-size to 16px
  // and, being inline, beat the class -- microscopic text on large screens.
  fontFamily: "inherit",
  color: "inherit",
}

const ellipsis: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}
