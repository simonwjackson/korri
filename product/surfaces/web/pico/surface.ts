import { defineSurface } from "@platform/surface/surface-manifest"

export const picoSurface = defineSurface({
  id: "@korri:pico",
  kind: "surface",
  medium: "web",
  consumes: ["input.subscribe"],
})
