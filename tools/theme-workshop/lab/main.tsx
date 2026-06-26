import "@fontsource-variable/geist"
import "@fontsource-variable/nunito"
import "@platform/react/primitives/theme/styles.css"
import { startSpatialNavigation } from "@platform/browser/navigation/start"
import { RouterProvider } from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import "../device-lab/device-lab.css"
import "../workshop.css"
import "./lab.css"
import "./lab-chrome.css"
import "./lab-shell.css"
import { createLabRouter } from "./lab-router"

// Boot the real device-agnostic input engine for the lab, exactly as the
// shipping app does (product/apps/portal/main.tsx). Surfaces mounted in the lab
// then receive genuine keyboard + gamepad navigation through the same focus
// engine the device uses — so an input regression (e.g. a surface that stops
// reacting to controller `direction`) surfaces here instead of only on hardware.
// Scoped to the live surface mount so directional input drives the previewed
// surface rather than the lab's own chrome.
startSpatialNavigation({
  scope: () => document.querySelector<HTMLElement>("[data-lab-surface-mount]"),
})

const host = document.getElementById("root")
if (host) createRoot(host).render(<RouterProvider router={createLabRouter()} />)
