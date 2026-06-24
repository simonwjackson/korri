import type { RouterHistory } from "@tanstack/history"
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useParams,
  useRouter,
} from "@tanstack/react-router"
import { useEffect } from "react"
import { normalizeSurfacePath, surfacePathToSplat } from "./lab-route-state"
import { LabRoot } from "./LabRoot"
import { defaultLabSurfaceAdapterId } from "./surface-registry"

const rootRoute = createRootRoute({ component: () => <Outlet /> })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LabIndexRedirect,
})

const labRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lab/$devices/$themeId/$",
  component: LabRoute,
})

const routeTree = rootRoute.addChildren([indexRoute, labRoute])

export interface CreateLabRouterOptions {
  readonly history?: RouterHistory
}

export function createLabRouter(options: CreateLabRouterOptions = {}) {
  return createRouter({
    routeTree,
    ...(options.history ? { history: options.history } : {}),
  })
}

function LabIndexRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.history.replace(
      buildLabPath("all", defaultLabSurfaceAdapterId(), "/"),
    )
  }, [router])
  return null
}

function LabRoute() {
  const router = useRouter()
  const params = useParams({ strict: false }) as {
    readonly devices?: string
    readonly themeId?: string
    readonly _splat?: string
    readonly "*"?: string
  }
  const devicesSegment = params.devices ?? "all"
  const themeId = params.themeId ?? defaultLabSurfaceAdapterId()
  const surfacePath = normalizeSurfacePath(params._splat ?? params["*"])

  return (
    <LabRoot
      routeState={{ devicesSegment, themeId, surfacePath }}
      navigation={{
        setDevicesSegment: nextDevices =>
          router.history.push(buildLabPath(nextDevices, themeId, surfacePath)),
        setThemeId: nextTheme =>
          router.history.push(
            buildLabPath(devicesSegment, nextTheme, surfacePath),
          ),
        setSurfacePath: nextSurfacePath =>
          router.history.push(
            buildLabPath(devicesSegment, themeId, nextSurfacePath),
          ),
      }}
    />
  )
}

export function buildLabPath(
  devicesSegment: string,
  themeId: string,
  surfacePath: string,
): string {
  const splat = surfacePathToSplat(surfacePath)
  const suffix = splat ? `/${splat}` : "/"
  return `/lab/${devicesSegment}/${themeId}${suffix}`
}
