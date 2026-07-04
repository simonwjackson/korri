import type { RouterHistory } from "@tanstack/history"
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import type { ShiftLibraryLens } from "../pages/ShiftLensRow"
import type { ShiftLibrarySort } from "../pages/shift-library-query"
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
  // The library's addressable view-state: `lens` and `sort` live in typed URL
  // search so a space like /library?lens=favorites&sort=title is deep-linkable
  // and reproduced on cold load. Unknown/missing values normalize to defaults.
  validateSearch: (
    search: Record<string, unknown>,
  ): { readonly lens: ShiftLibraryLens; readonly sort: ShiftLibrarySort } => {
    const lens = search.lens
    const sort = search.sort
    return {
      lens: lens === "favorites" || lens === "genre" ? lens : "all",
      sort: sort === "title" || sort === "playtime" ? sort : "recent",
    }
  },
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
