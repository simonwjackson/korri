import { useAtomValue } from "@effect/atom-react"
import { deviceStateAtom } from "@platform/react/device/device-atoms"
import type { CSSProperties } from "react"
import { PicoIcon } from "./PicoIcon"
import { PicoMascot } from "./PicoMascot"
import { picoClockIsoAtom, picoClockLabelForIso } from "./pico-clock-state"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "./pico-design-parts"
import {
  picoNetworkConnected,
  picoNetworkReadingAtom,
} from "./pico-network-state"
import {
  type PicoPowerDisplay,
  picoPowerDisplayForDeviceState,
} from "./pico-power-state"

export interface PicoStatusBarProps {
  readonly label: string
  /** Compact 24-hour clock, e.g. "10:24". */
  readonly time?: string
  /** Battery charge 0..100; omit to hide the battery indicator. */
  readonly batteryPercent?: number
  readonly charging?: boolean
  /** Wi-Fi connectivity; drives the glyph's connected/off styling. */
  readonly connected?: boolean
}

/**
 * Pico status bar — prop-driven chrome (mascot + title + wifi + clock +
 * battery). Kept pure so the lab can drive it in isolation; the live derivation
 * lives in `PicoStatusBarLive` below (device facts flow through production
 * derivation, never hand-set props).
 */
export function PicoStatusBar({
  label,
  time = "10:24",
  batteryPercent,
  charging = false,
  connected = true,
}: PicoStatusBarProps) {
  const fill =
    batteryPercent === undefined
      ? 0
      : Math.max(0, Math.min(100, batteryPercent)) / 100
  return (
    <div
      className="pico-statusbar"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.statusBar)}
    >
      <span className="pico-statusbar-lead">
        <PicoMascot className="pcMascot-bar" />
        <span className="pico-statusbar-title">{label}</span>
      </span>
      <span className="pico-statusbar-status">
        <PicoIcon
          name="wifi"
          className={`pico-statusbar-ico ${connected ? "" : "off"}`}
        />
        <span className="pico-clock">{time}</span>
        {batteryPercent !== undefined ? (
          <span className="pico-battery" data-charging={charging || undefined}>
            <span className="pico-battery-pct">{batteryPercent}%</span>
            <i style={{ "--pico-battery-fill": fill } as CSSProperties} />
          </span>
        ) : null}
      </span>
    </div>
  )
}

/** Derives battery/network/clock props from the shared device-state atoms and
 * renders the pure status bar. This is the composing host: the same atoms
 * production feeds and the lab drives via events/inputs. Falls back to the
 * status bar's own defaults when a fact is unknown (design-catalog look). */
export function PicoStatusBarLive({ label }: { readonly label: string }) {
  const deviceState = useAtomValue(deviceStateAtom)
  const network = useAtomValue(picoNetworkReadingAtom)
  const clockIso = useAtomValue(picoClockIsoAtom)
  const power = picoPowerDisplayForDeviceState(deviceState)
  return (
    <PicoStatusBar
      label={label}
      time={picoClockLabelForIso(clockIso)}
      connected={picoNetworkConnected(network)}
      {...batteryPropsForDisplay(power)}
    />
  )
}

function batteryPropsForDisplay(display: PicoPowerDisplay): {
  readonly batteryPercent?: number
  readonly charging?: boolean
} {
  if (display._tag === "Ready" || display._tag === "Stale") {
    return { batteryPercent: display.percent, charging: display.charging }
  }
  // No live battery: NoBattery hides it; Unknown shows the design-catalog
  // default (82%) so a bare preview stays populated.
  if (display._tag === "Hidden") return {}
  return { batteryPercent: 82 }
}

export function PicoButtonBar({
  hints,
}: {
  readonly hints: readonly {
    readonly key: "a" | "b" | "y"
    readonly label: string
  }[]
}) {
  return (
    <div className="pico-buttonbar">
      {hints.map(hint => (
        <span className="pico-hint" key={hint.key}>
          <span className={`pico-key ${hint.key}`}>
            {hint.key.toUpperCase()}
          </span>
          {hint.label}
        </span>
      ))}
    </div>
  )
}
