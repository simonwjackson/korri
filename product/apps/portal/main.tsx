import { LauncherLayerRpc } from "@app/features/home/launcher-layer-rpc"
import { LibrarySourceLayerRpc } from "@app/features/home/library-source-layer-rpc"
import { RegistryProvider } from "@effect/atom-react"
import {
  type ControllerInputProfile,
  isControllerInputProfile,
} from "@platform/browser/navigation/controller-profile"
import { startSpatialNavigation } from "@platform/browser/navigation/start"
import {
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import ReactDOM from "react-dom/client"
import { readInlinedRuntimeConfig } from "./read-inlined-runtime-config"
import { routeTree } from "./routeTree.gen"
import { buildSpatialNavigationConfig } from "./spatial-navigation-config"
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

// Seed the launcher / library-source atoms via `<RegistryProvider
// initialValues={…}>` so the first `useAtomValue(libraryRuntime)` in
// the tree sees the chosen layers instead of the
// `loadingForeverLibrarySourceLayer` placeholder. This replaces
// `HomeServerRoot`'s `useLayoutEffect` + `layersReady` flag: selection
// now happens at the React composition root, before the tree mounts.
//
// `LibrarySourceLayerRpc` is the only library source. `LauncherLayerRpc`
// is the only Launcher: kiosk and non-kiosk deploys both route launches
// through the server's `app.library.launch`, which dispatches local vs.
// Moonlight launches via sessiond.
const initialValues = [
  [librarySourceLayerAtom, LibrarySourceLayerRpc],
  [launcherLayerAtom, LauncherLayerRpc],
] as const

ReactDOM.createRoot(rootElement).render(
  <RegistryProvider initialValues={initialValues}>
    <RouterProvider router={router} />
  </RegistryProvider>,
)

// Device-agnostic spatial navigation. Controller backend is runtime-
// configured: on the desktop deploy, bun inlines `window.__korriRuntimeConfig`
// into the served `index.html`; on the portal deploy (and Storybook / dev
// web / unit tests), the global is absent and `readInlinedRuntimeConfig`
// returns the `{ desktopInput: false }` default so the gamepad adapter
// handles controller input.
const controllerProfile = readControllerInputProfile(
  import.meta.env.VITE_KORRI_CONTROLLER_PROFILE,
)

startSpatialNavigation(
  buildSpatialNavigationConfig(runtimeConfig, controllerProfile),
)

function readControllerInputProfile(value: unknown): ControllerInputProfile {
  return isControllerInputProfile(value) ? value : "auto"
}
