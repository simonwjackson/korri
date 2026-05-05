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

// Device-agnostic spatial navigation. Listens to keyboard plus the native
// input bridge and drives focus through the live DOM via LRUD. Components stay
// native HTML. The browser Gamepad API adapter is disabled so controller input
// has one authoritative path on device.
const nativeBridgeUrl = import.meta.env.VITE_KORRI_NATIVE_BRIDGE_URL
startSpatialNavigation({
  diagnostics: true,
  gamepad: false,
  native: nativeBridgeUrl ? { url: nativeBridgeUrl } : false,
})
