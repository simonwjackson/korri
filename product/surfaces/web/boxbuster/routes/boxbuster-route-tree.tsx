import type { RouterHistory } from "@tanstack/history"
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router"
import { BoxbusterStoreRoute } from "./BoxbusterStoreRoute"

const rootRoute = createRootRoute({ component: () => <Outlet /> })

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: BoxbusterStoreRoute,
})

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$id",
  component: BoxbusterStoreRoute,
})

export const boxbusterRouteTree = rootRoute.addChildren([homeRoute, gameRoute])

export interface CreateBoxbusterRouterOptions {
  readonly history?: RouterHistory
}

export function createBoxbusterRouter(
  options: CreateBoxbusterRouterOptions = {},
) {
  return createRouter({
    routeTree: boxbusterRouteTree,
    ...(options.history ? { history: options.history } : {}),
  })
}
