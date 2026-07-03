import type { RouterHistory } from "@tanstack/history"
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { SHIFT_COMPANION_PATH, SHIFT_LIBRARY_PATH } from "./paths"
import { ShiftCompanionRoute } from "./ShiftCompanionRoute"
import { ShiftGameDetailRoute } from "./ShiftGameDetailRoute"
import { ShiftHomeRoute } from "./ShiftHomeRoute"
import { ShiftLibraryRoute } from "./ShiftLibraryRoute"
import { ShiftRouteTransition } from "./ShiftRouteTransition"

const rootRoute = createRootRoute({ component: ShiftRouteTransition })

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ShiftHomeRoute,
})

const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$id",
  component: ShiftGameDetailRoute,
})

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SHIFT_LIBRARY_PATH,
  component: ShiftLibraryRoute,
})

const companionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SHIFT_COMPANION_PATH,
  component: ShiftCompanionRoute,
})

export const shiftRouteTree = rootRoute.addChildren([
  homeRoute,
  detailRoute,
  libraryRoute,
  companionRoute,
])

export interface CreateShiftRouterOptions {
  readonly history?: RouterHistory
}

export function createShiftRouter(options: CreateShiftRouterOptions = {}) {
  return createRouter({
    routeTree: shiftRouteTree,
    ...(options.history ? { history: options.history } : {}),
  })
}
