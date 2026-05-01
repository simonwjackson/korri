import { startSpatialNavigation } from "@shared/navigation/start"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import ReactDOM from "react-dom/client"
import { routeTree } from "./routeTree.gen"
import "@shared/design-system/theme/styles.css"
import "@shared/themes/shift/shift.css"
import "@fontsource-variable/geist"

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

// Device-agnostic spatial navigation. Listens to keyboard + gamepad and
// drives focus through the live DOM via LRUD. Components stay native HTML.
startSpatialNavigation()
