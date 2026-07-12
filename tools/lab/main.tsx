/**
 * korri's Caliper lab entry.
 *
 * The lab ENGINE (canvas, device frames, routing, chrome) comes entirely from
 * the @simonwjackson/caliper package. korri contributes only its surfaces: the
 * live adapters (shift/pico/boxbuster) and the product parts glob. This file is
 * the whole seam — swap data at the last-mile edge, never the mechanism.
 */

import "@simonwjackson/caliper/style.css"
import "@platform/react/primitives/theme/styles.css"

import { startSpatialNavigation } from "@platform/browser/navigation/start"
import { createCaliperApp } from "@simonwjackson/caliper"
import { surfacePartModules } from "@product/surfaces/web/parts-glob"
import { boxbusterLabSurfaceAdapter } from "./adapters/boxbuster"
import { picoLabSurfaceAdapter } from "./adapters/pico"
import { shiftLabSurfaceAdapter } from "./adapters/shift"

const host = document.getElementById("root")
if (!host) {
  throw new Error("Missing #root element for the korri Caliper lab")
}

createCaliperApp(host, {
  adapters: [
    shiftLabSurfaceAdapter,
    picoLabSurfaceAdapter,
    boxbusterLabSurfaceAdapter,
  ],
  partsGlob: surfacePartModules(),
  // Boot the real device-agnostic input engine, exactly as the shipping app
  // does, scoped to the live surface mount — so an input regression surfaces
  // here (keyboard + gamepad) instead of only on hardware.
  beforeMount: () => {
    startSpatialNavigation({
      scope: () =>
        document.querySelector<HTMLElement>("[data-lab-surface-mount]"),
    })
  },
})
