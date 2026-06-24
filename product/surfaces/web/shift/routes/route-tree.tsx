import type { RouterHistory } from "@tanstack/history"
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router"
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

export const shiftRouteTree = rootRoute.addChildren([homeRoute, detailRoute])

export interface CreateShiftRouterOptions {
  readonly history?: RouterHistory
}

export function createShiftRouter(options: CreateShiftRouterOptions = {}) {
  return createRouter({
    routeTree: shiftRouteTree,
    ...(options.history ? { history: options.history } : {}),
  })
}
