import {
  type ControllerInputProfile,
  isControllerInputProfile,
} from "@shared/navigation/controller-profile"
import { startSpatialNavigation } from "@shared/navigation/start"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import ReactDOM from "react-dom/client"
import {
  isRuntimeConfigBridgeState,
  type RuntimeConfigBridgeState,
} from "../desktop/runtime-config-bridge"
import { buildSpatialNavigationConfig } from "./spatial-navigation-config"
import { routeTree } from "./routeTree.gen"
import "@shared/primitives/theme/styles.css"
import "@shared/themes/shift/shift.css"
import "@fontsource-variable/geist"
import "@fontsource-variable/nunito"

interface KorriRuntimeBridge {
  getState(): RuntimeConfigBridgeState
  subscribe(listener: (state: RuntimeConfigBridgeState) => void): () => void
}

declare global {
  interface Window {
    __korriRuntime?: KorriRuntimeBridge
  }
}

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

// Device-agnostic spatial navigation. Controller backend is now runtime-
// configured (was Vite-baked): the desktop preload installs a bridge on
// `window.__korriRuntime` and the bun side pushes `{ nativeBridgeUrl }`
// once on dom-ready. On host variants and non-desktop deploys (dev web,
// Storybook), the bridge is absent or reports `nativeBridgeUrl: null` and
// the gamepad adapter handles controller input.
const controllerProfile = readControllerInputProfile(
  import.meta.env.VITE_KORRI_CONTROLLER_PROFILE,
)

let lastNativeBridgeUrl: string | null = null
startWithRuntimeConfig(getInitialRuntimeConfig(), controllerProfile)

// Subscribe to runtime-config changes so the device variant's dom-ready
// push reconfigures spatial navigation with the native bridge. Re-calls
// to `startSpatialNavigation` dispose the previous handle and rebuild;
// `useInputAction` consumers re-subscribe via `subscribeSpatialNavigation`.
// Skip the rebuild when the URL hasn't changed (e.g. the host variant's
// push of `{ nativeBridgeUrl: null }` matches the initial state).
window.__korriRuntime?.subscribe(state => {
  if (state.nativeBridgeUrl === lastNativeBridgeUrl) return
  startWithRuntimeConfig(state, controllerProfile)
})

function startWithRuntimeConfig(
  runtime: RuntimeConfigBridgeState,
  profile: ControllerInputProfile,
): void {
  lastNativeBridgeUrl = runtime.nativeBridgeUrl
  startSpatialNavigation(buildSpatialNavigationConfig(runtime, profile))
}

function getInitialRuntimeConfig(): RuntimeConfigBridgeState {
  const bridge = window.__korriRuntime
  if (!bridge) return { nativeBridgeUrl: null }
  const value = bridge.getState()
  return isRuntimeConfigBridgeState(value)
    ? value
    : { nativeBridgeUrl: null }
}

function readControllerInputProfile(value: unknown): ControllerInputProfile {
  return isControllerInputProfile(value) ? value : "auto"
}
