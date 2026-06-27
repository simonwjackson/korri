import type { RouterHistory } from "@tanstack/history"
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router"
import { SHIFT_COMPANION_PATH } from "./paths"
import { ShiftCompanionRoute } from "./ShiftCompanionRoute"
import { ShiftGameDetailRoute } from "./ShiftGameDetailRoute"
import { ShiftHomeRoute } from "./ShiftHomeRoute"

const rootRoute = createRootRoute({ component: () => <Outlet /> })

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

const companionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SHIFT_COMPANION_PATH,
  component: ShiftCompanionRoute,
})

export const shiftRouteTree = rootRoute.addChildren([
  homeRoute,
  detailRoute,
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
