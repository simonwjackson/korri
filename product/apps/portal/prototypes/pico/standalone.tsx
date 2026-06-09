/**
 * PROTOTYPE — standalone backend-free viewer. Throwaway.
 *
 * Mounts the three pico home-screen variants on the reusable device-lab
 * calibration desk, with no router / bridge / RPC / API. This is the reliable
 * way to view the prototype while the portal's full dev stack is unavailable:
 *   just dev-pico
 */
import { useState } from "react"
import { createRoot } from "react-dom/client"
import { DeviceLab, type DeviceConfig, type ThemeKnob } from "./device-lab"
import { picoGames, picoRecent } from "./fixtures"
import {
  PicoPrototypeSwitcher,
  type PicoVariantDef,
} from "./PicoPrototypeSwitcher"
import { VariantCartridgeShelf } from "./VariantCartridgeShelf"
import { VariantGameDetail } from "./VariantGameDetail"
import { VariantIconGrid } from "./VariantIconGrid"
import { VariantInGame } from "./VariantInGame"
import { VariantSettings } from "./VariantSettings"
import "./device-lab/device-lab.css"
import "./pico-prototype.css"

const VARIANTS: readonly PicoVariantDef[] = [
  { key: "A", name: "Home" },
  { key: "B", name: "Settings" },
  { key: "C", name: "Browse" },
  { key: "D", name: "Game Detail" },
  { key: "E", name: "In-Game" },
]

// Calibrated seed exported from the device-lab desk. SCALE (px/mm) is
// monitor-specific — recalibrate per monitor via the credit card. Device mm +
// text/pad are the committed design defaults. localStorage (pico:lab) shadows
// this per browser; the calibrator's `reset` falls back to this seed.
const PICO_DEFAULT_PX_PER_MM = 6.78
const PICO_DEVICES: readonly DeviceConfig[] = [
  {
    id: "rg353m",
    name: "RG353M",
    widthMm: 72,
    heightMm: 52,
    textPct: 100,
    padPct: 100,
  },
  {
    id: "thor",
    name: "THOR",
    widthMm: 132,
    heightMm: 76,
    textPct: 100,
    padPct: 100,
  },
  {
    id: "odin2portal",
    name: "ODIN 2 PORTAL",
    widthMm: 156,
    heightMm: 85,
    textPct: 100,
    padPct: 100,
  },
  {
    // 65" 16:9 panel. Far larger than the viewport -> the lab scales it down
    // to fit (display only); its layout resolves as a true 4K 10-foot screen.
    id: "tv65",
    name: '65" 4K TV',
    widthMm: 1439,
    heightMm: 809,
    textPct: 100,
    padPct: 100,
    bezel: false,
  },
]

// Generator knobs (the scale's character). Defaults mirror the CSS fallbacks.
const PICO_KNOBS: readonly ThemeKnob[] = [
  {
    id: "base",
    label: "BASE",
    cssVar: "--pico-base-cqi",
    min: 0.5,
    max: 6,
    step: 0.1,
    default: 2.5,
  },
  {
    id: "min",
    label: "MIN",
    cssVar: "--pico-base-min",
    min: 4,
    max: 24,
    step: 1,
    default: 8,
    unit: "px",
  },
  {
    id: "max",
    label: "MAX",
    cssVar: "--pico-base-max",
    min: 12,
    max: 320,
    step: 1,
    default: 200,
    unit: "px",
  },
  {
    id: "ratio",
    label: "RATIO",
    cssVar: "--pico-type-ratio",
    min: 1.1,
    max: 1.6,
    step: 0.01,
    default: 1.25,
  },
  {
    id: "space",
    label: "SPACE",
    cssVar: "--pico-space-unit",
    min: 0.2,
    max: 1.2,
    step: 0.05,
    default: 0.5,
    unit: "em",
  },
]

function renderVariant(variant: string) {
  if (variant === "A") return <VariantCartridgeShelf games={picoGames} />
  if (variant === "B") return <VariantSettings />
  if (variant === "C") return <VariantIconGrid games={picoGames} />
  if (variant === "D") return <VariantGameDetail games={picoGames} />
  if (variant === "E") {
    const hero = picoRecent[0] ?? picoGames[0]
    return hero ? <VariantInGame game={hero} /> : null
  }
  return null
}

function PicoStandalone() {
  const [variant, setVariant] = useState("A")
  return (
    <div data-pico>
      <DeviceLab
        storageKey="pico"
        devices={PICO_DEVICES}
        themeKnobs={PICO_KNOBS}
        defaultPxPerMm={PICO_DEFAULT_PX_PER_MM}
        scaleVarPrefix="pico"
        stageClassName="pico-stage"
        screensClassName="pico-screens"
        bezelClassName="pico-bezel"
        screenClassName="pico-screen"
        render={() => renderVariant(variant)}
      />
      <PicoPrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onSelect={setVariant}
      />
    </div>
  )
}

const host = document.getElementById("root")
if (host) createRoot(host).render(<PicoStandalone />)
