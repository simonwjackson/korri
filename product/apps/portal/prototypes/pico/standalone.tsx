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
import { DeviceLab, type DeviceConfig } from "./device-lab"
import { picoGames } from "./fixtures"
import {
  PicoPrototypeSwitcher,
  type PicoVariantDef,
} from "./PicoPrototypeSwitcher"
import { VariantCartridgeShelf } from "./VariantCartridgeShelf"
import { VariantIconGrid } from "./VariantIconGrid"
import { VariantMenuList } from "./VariantMenuList"
import "./device-lab/device-lab.css"
import "./pico-prototype.css"

const VARIANTS: readonly PicoVariantDef[] = [
  { key: "A", name: "Cartridge Shelf" },
  { key: "B", name: "Menu List + Preview" },
  { key: "C", name: "Icon Grid" },
]

const PICO_DEVICES: readonly DeviceConfig[] = [
  // RG353M: 3.5" 4:3 panel.
  {
    id: "handheld",
    name: "HANDHELD",
    widthMm: 71.1,
    heightMm: 53.3,
    textPct: 140,
    padPct: 100,
  },
  // Hypothetical larger 16:9 lean-back panel.
  {
    id: "panel",
    name: "PANEL",
    widthMm: 120,
    heightMm: 67.5,
    textPct: 140,
    padPct: 100,
  },
]

function renderVariant(variant: string) {
  if (variant === "A") return <VariantCartridgeShelf games={picoGames} />
  if (variant === "B") return <VariantMenuList games={picoGames} />
  if (variant === "C") return <VariantIconGrid games={picoGames} />
  return null
}

function PicoStandalone() {
  const [variant, setVariant] = useState("A")
  return (
    <div data-pico>
      <DeviceLab
        storageKey="pico"
        devices={PICO_DEVICES}
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
