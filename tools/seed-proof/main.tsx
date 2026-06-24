/**
 * Seed proof — a click-through Shift slice driven entirely by an in-memory seed.
 *
 * Proves the data + navigation seam with no API/device: production-shaped atom
 * seeding (RegistryProvider + useAtomInitialValues, exactly like
 * HomeRuntimeLayersRoot) swaps the live RPC layers for an in-memory catalog, and
 * a TanStack router navigates home -> /game/$id, both reading the same seeded
 * catalog atom. Run with `just dev-seed-proof`.
 *
 * Routing is code-based here (the harness lives under tools/, which is
 * typechecked but has no route-codegen step); the portal stays file-based.
 */
import "@fontsource-variable/geist"
import "@fontsource-variable/nunito"
import { RegistryProvider, useAtomInitialValues } from "@effect/atom-react"
import "@platform/react/primitives/theme/styles.css"
import "@product/surfaces/web/shift/shift.css"
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import { Detail } from "./Detail"
import { Home } from "./Home"
import { makeSeedInitialValues } from "./seed"

const rootRoute = createRootRoute({ component: () => <Outlet /> })
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
})
const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$id",
  component: Detail,
})
const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, detailRoute]),
})

function App({
  seedInitialValues,
}: {
  readonly seedInitialValues: Awaited<ReturnType<typeof makeSeedInitialValues>>
}) {
  // Same injection point production uses, but seeded in memory.
  useAtomInitialValues(seedInitialValues)
  return <RouterProvider router={router} />
}

async function boot() {
  const host = document.getElementById("root")
  if (!host) return
  const seedInitialValues = await makeSeedInitialValues()
  createRoot(host).render(
    <RegistryProvider>
      <App seedInitialValues={seedInitialValues} />
    </RegistryProvider>,
  )
}

void boot()
