/**
 * PROTOTYPE — standalone backend-free viewer. Throwaway.
 *
 * Mounts the three pico home-screen variants with the floating switcher,
 * with no router / bridge / RPC / API. This is the reliable way to view
 * the prototype while the portal's full dev stack is unavailable. Run:
 *   bun run vite --root product/apps/portal/prototypes/pico --port 3100
 */
import { useState } from "react"
import { createRoot } from "react-dom/client"
import { picoGames } from "./fixtures"
import {
  PicoPrototypeSwitcher,
  type PicoVariantDef,
} from "./PicoPrototypeSwitcher"
import { VariantCartridgeShelf } from "./VariantCartridgeShelf"
import { VariantIconGrid } from "./VariantIconGrid"
import { VariantMenuList } from "./VariantMenuList"
import "./pico-prototype.css"

const VARIANTS: readonly PicoVariantDef[] = [
  { key: "A", name: "Cartridge Shelf" },
  { key: "B", name: "Menu List + Preview" },
  { key: "C", name: "Icon Grid" },
]

function PicoStandalone() {
  const [variant, setVariant] = useState("A")
  return (
    <div className="pico-stage" data-pico>
      <div className="pico-bezel">
        <div className="pico-screen">
          {variant === "A" ? <VariantCartridgeShelf games={picoGames} /> : null}
          {variant === "B" ? <VariantMenuList games={picoGames} /> : null}
          {variant === "C" ? <VariantIconGrid games={picoGames} /> : null}
        </div>
      </div>
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
