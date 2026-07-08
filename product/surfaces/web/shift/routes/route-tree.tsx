import type { RouterHistory } from "@tanstack/history"
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import type { ShiftLibraryLens } from "../pages/ShiftLensRow"
import type { ShiftLibrarySort } from "../pages/shift-library-query"
import {
  SHIFT_COMPANION_PATH,
  SHIFT_LIBRARY_PATH,
  SHIFT_STORE_DETAIL_PATH,
  SHIFT_STORE_PATH,
} from "./paths"
import {
  type ShiftRouteAxis,
  type ShiftRouteManifest,
  shiftRouteManifest,
} from "./route-axis-manifest"
import { ShiftCompanionRoute } from "./ShiftCompanionRoute"
import { ShiftGameDetailRoute } from "./ShiftGameDetailRoute"
import { ShiftHomeRoute } from "./ShiftHomeRoute"
import { ShiftLibraryRoute } from "./ShiftLibraryRoute"
import { ShiftRouteTransition } from "./ShiftRouteTransition"
import { ShiftStoreDetailRoute } from "./ShiftStoreDetailRoute"
import { ShiftStoreRoute } from "./ShiftStoreRoute"

const rootRoute = createRootRoute({ component: ShiftRouteTransition })

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  staticData: { axes: [{ name: "data", kind: "data" }] },
  component: ShiftHomeRoute,
})

const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$id",
  staticData: {
    axes: [
      { name: "id", kind: "param" },
      { name: "data", kind: "data" },
    ],
  },
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
  // Axis manifest for tooling: `lens`/`sort` are the addressable (search) axes
  // handled by validateSearch above; `data` is the seeded catalog axis.
  staticData: {
    axes: [
      { name: "lens", kind: "search" },
      { name: "sort", kind: "search" },
      { name: "data", kind: "data" },
    ],
  },
  component: ShiftLibraryRoute,
})

const storeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SHIFT_STORE_PATH,
  // The store's addressable view-state: the search query lives in typed URL
  // search so /store?q=celeste is deep-linkable and reproduced on cold load.
  validateSearch: (
    search: Record<string, unknown>,
  ): { readonly q: string } => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  staticData: {
    axes: [
      { name: "q", kind: "search" },
      { name: "data", kind: "data" },
    ],
  },
  component: ShiftStoreRoute,
})

const storeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SHIFT_STORE_DETAIL_PATH,
  validateSearch: (
    search: Record<string, unknown>,
  ): { readonly q: string } => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  staticData: {
    axes: [
      { name: "entryId", kind: "param" },
      { name: "q", kind: "search" },
      { name: "data", kind: "data" },
    ],
  },
  component: ShiftStoreDetailRoute,
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
  storeRoute,
  storeDetailRoute,
  companionRoute,
])

/**
 * The declared axis manifest for each committed route, read from `staticData`.
 * The lab consumes this to enumerate a route's axes uniformly (see the
 * route-first panel and the manifest-driven `axesForScreen`).
 */
export function shiftRouteManifests(): readonly ShiftRouteManifest[] {
  const readAxes = (route: {
    readonly options: { readonly staticData?: unknown }
  }) =>
    (route.options.staticData ?? {}) as {
      readonly axes?: readonly ShiftRouteAxis[]
    }
  return [
    shiftRouteManifest("/", readAxes(homeRoute)),
    shiftRouteManifest(SHIFT_LIBRARY_PATH, readAxes(libraryRoute)),
    shiftRouteManifest(SHIFT_STORE_PATH, readAxes(storeRoute)),
    shiftRouteManifest(SHIFT_STORE_DETAIL_PATH, readAxes(storeDetailRoute)),
    shiftRouteManifest("/game/$id", readAxes(detailRoute)),
  ]
}

export interface CreateShiftRouterOptions {
  readonly history?: RouterHistory
}

export function createShiftRouter(options: CreateShiftRouterOptions = {}) {
  return createRouter({
    routeTree: shiftRouteTree,
    ...(options.history ? { history: options.history } : {}),
  })
}
