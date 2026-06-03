import {
  type ControllerInputProfile,
  isControllerInputProfile,
} from "@platform/browser/navigation/controller-profile"
import { startSpatialNavigation } from "@platform/browser/navigation/start"
import { installKorriPlatformBridge } from "@platform/theme/bridge"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import ReactDOM from "react-dom/client"
import { createPortalPlatformBridge } from "./platform-bridge"
import { readInlinedRuntimeConfig } from "./read-inlined-runtime-config"
import { routeTree } from "./routeTree.gen"
import { buildSpatialNavigationConfig } from "./spatial-navigation-config"
import { PlatformBridgeProvider } from "./themes/platform-bridge-context"
import "@shared/primitives/theme/styles.css"
import "@product/themes/shift/shift.css"
import "@product/themes/evier/evier.css"
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

// Read runtime-config inlined by bun into the served `index.html`. On
// the portal deploy the global is absent and the helper returns the
// `{ desktopInput: false }` default.
const runtimeConfig = readInlinedRuntimeConfig(window)

// Device-agnostic spatial navigation. Controller backend is runtime-
// configured: on the desktop deploy, bun inlines `window.__korriRuntimeConfig`
// into the served `index.html`; on the portal deploy (and Storybook / dev
// web / unit tests), the global is absent and `readInlinedRuntimeConfig`
// returns the `{ desktopInput: false }` default so the gamepad adapter
// handles controller input.
const controllerProfile = readControllerInputProfile(
  import.meta.env.VITE_KORRI_CONTROLLER_PROFILE,
)

const navigation = startSpatialNavigation(
  buildSpatialNavigationConfig(runtimeConfig, controllerProfile),
)
const platformBridge = createPortalPlatformBridge({
  inputBus: navigation.bus,
  desktopInput: runtimeConfig.desktopInput,
})
const uninstallPlatformBridge = installKorriPlatformBridge(
  window,
  platformBridge,
)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    uninstallPlatformBridge()
    navigation.dispose()
  })
}

ReactDOM.createRoot(rootElement).render(
  <PlatformBridgeProvider bridge={platformBridge}>
    <RouterProvider router={router} />
  </PlatformBridgeProvider>,
)

function readControllerInputProfile(value: unknown): ControllerInputProfile {
  return isControllerInputProfile(value) ? value : "auto"
}
