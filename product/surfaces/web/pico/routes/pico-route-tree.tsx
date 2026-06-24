import type { RouterHistory } from "@tanstack/history"
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router"
import { PicoGameDetailRoute } from "./PicoGameDetailRoute"
import { PicoHomeRoute } from "./PicoHomeRoute"

const rootRoute = createRootRoute({ component: () => <Outlet /> })

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: PicoHomeRoute,
})

const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$id",
  component: PicoGameDetailRoute,
})

export const picoRouteTree = rootRoute.addChildren([homeRoute, detailRoute])

export interface CreatePicoRouterOptions {
  readonly history?: RouterHistory
}

export function createPicoRouter(options: CreatePicoRouterOptions = {}) {
  return createRouter({
    routeTree: picoRouteTree,
    ...(options.history ? { history: options.history } : {}),
  })
}
