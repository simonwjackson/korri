import { defineSurface } from "@platform/surface/surface-manifest"

export const shiftSurface = defineSurface({
  id: "@korri:shift",
  kind: "surface",
  medium: "web",
  consumes: ["catalog.read", "library.launch", "input.subscribe"],
})
