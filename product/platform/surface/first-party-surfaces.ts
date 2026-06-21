import { evierSurface } from "@product/surfaces/web/evier/surface"
import { shiftSurface } from "@product/surfaces/web/shift/surface"
import { vigieSurface } from "@product/surfaces/web/vigie/surface"
import { createSurfaceRegistry } from "./surface-registry"

export const firstPartySurfaceManifests = [
  shiftSurface,
  evierSurface,
  vigieSurface,
] as const

export const firstPartySurfaceRegistry = createSurfaceRegistry(
  firstPartySurfaceManifests,
)
