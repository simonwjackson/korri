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
import { routeTree } from "./routeTree.gen"
import { buildSpatialNavigationConfig } from "./spatial-navigation-config"
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
// configured (was Vite-baked): the desktop preload installs bridges on
// `window.__korriRuntime` and `window.__korriInput`, and the bun side pushes
// `{ desktopInput: true }` once on dom-ready. On non-desktop deploys (dev web,
// Storybook), the runtime bridge is absent and the gamepad adapter handles
// controller input.
const controllerProfile = readControllerInputProfile(
  import.meta.env.VITE_KORRI_CONTROLLER_PROFILE,
)

let lastDesktopInput: boolean | null = null
startWithRuntimeConfig(getInitialRuntimeConfig(), controllerProfile)

// Subscribe to runtime-config changes so the desktop dom-ready push
// reconfigures spatial navigation with the desktop input bridge. Re-calls to
// `startSpatialNavigation` dispose the previous handle and rebuild;
// `useInputAction` consumers re-subscribe via `subscribeSpatialNavigation`.
// Electrobun's custom preload can be late/missing on the native renderer, so
// also poll briefly until main's bridge fallback appears.
subscribeRuntimeConfigChanges()

function startWithRuntimeConfig(
  runtime: RuntimeConfigBridgeState,
  profile: ControllerInputProfile,
): void {
  lastDesktopInput = runtime.desktopInput
  startSpatialNavigation(buildSpatialNavigationConfig(runtime, profile))
}

function getInitialRuntimeConfig(): RuntimeConfigBridgeState {
  const bridge = window.__korriRuntime
  if (!bridge) return { desktopInput: false }
  const value = bridge.getState()
  return isRuntimeConfigBridgeState(value) ? value : { desktopInput: false }
}

function subscribeRuntimeConfigChanges(): void {
  let unsubscribe: (() => void) | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined

  const subscribe = () => {
    if (unsubscribe) return
    const bridge = window.__korriRuntime
    if (!bridge) return

    const value = bridge.getState()
    if (isRuntimeConfigBridgeState(value)) {
      startWithRuntimeConfig(value, controllerProfile)
    }

    unsubscribe = bridge.subscribe(state => {
      if (state.desktopInput === lastDesktopInput) return
      startWithRuntimeConfig(state, controllerProfile)
    })

    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
  }

  subscribe()
  if (!unsubscribe) {
    pollTimer = setInterval(subscribe, 100)
  }
}

function readControllerInputProfile(value: unknown): ControllerInputProfile {
  return isControllerInputProfile(value) ? value : "auto"
}
