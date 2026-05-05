import {
  isControllerInputProfile,
  type ControllerInputProfile,
} from "@shared/navigation/controller-profile"
import { startSpatialNavigation } from "@shared/navigation/start"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import ReactDOM from "react-dom/client"
import { routeTree } from "./routeTree.gen"
import "@shared/primitives/theme/styles.css"
import "@shared/themes/shift/shift.css"
import "@fontsource-variable/geist"
import "@fontsource-variable/nunito"

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
})

const rootElement = document.getElementById("app")

if (!rootElement) {
  throw new Error("Unable to start app: #app element not found")
}

ReactDOM.createRoot(rootElement).render(<RouterProvider router={router} />)

// Device-agnostic spatial navigation. Controller input is profile-selected:
// dev web defaults to browser Gamepad API, while Odin builds provide a native
// bridge URL and therefore use inputd as the single authoritative controller
// backend. Components stay native HTML either way.
const nativeBridgeUrl = import.meta.env.VITE_KORRI_NATIVE_BRIDGE_URL
const controllerProfile = readControllerInputProfile(
  import.meta.env.VITE_KORRI_CONTROLLER_PROFILE,
)
startSpatialNavigation({
  diagnostics: true,
  controller: {
    profile: controllerProfile,
    native: nativeBridgeUrl ? { url: nativeBridgeUrl } : undefined,
  },
})

function readControllerInputProfile(value: unknown): ControllerInputProfile {
  return isControllerInputProfile(value) ? value : "auto"
}
