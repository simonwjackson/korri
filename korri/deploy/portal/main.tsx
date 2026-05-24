import {
  type ControllerInputProfile,
  isControllerInputProfile,
} from "@shared/navigation/controller-profile"
import { startSpatialNavigation } from "@shared/navigation/start"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import ReactDOM from "react-dom/client"
import { readInlinedRuntimeConfig } from "./read-inlined-runtime-config"
import { routeTree } from "./routeTree.gen"
import { buildSpatialNavigationConfig } from "./spatial-navigation-config"
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

// Device-agnostic spatial navigation. Controller backend is runtime-
// configured: on the desktop deploy, bun inlines `window.__korriRuntimeConfig`
// into the served `index.html`; on the portal deploy (and Storybook / dev
// web / unit tests), the global is absent and `readInlinedRuntimeConfig`
// returns the `{ desktopInput: false }` default so the gamepad adapter
// handles controller input.
const runtimeConfig = readInlinedRuntimeConfig(window)
const controllerProfile = readControllerInputProfile(
  import.meta.env.VITE_KORRI_CONTROLLER_PROFILE,
)

startSpatialNavigation(
  buildSpatialNavigationConfig(runtimeConfig, controllerProfile),
)

function readControllerInputProfile(value: unknown): ControllerInputProfile {
  return isControllerInputProfile(value) ? value : "auto"
}
