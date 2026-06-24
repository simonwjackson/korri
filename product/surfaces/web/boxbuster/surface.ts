import { defineSurface } from "@platform/surface/surface-manifest"

export const boxbusterSurface = defineSurface({
  id: "@korri:boxbuster",
  kind: "surface",
  medium: "web",
  consumes: ["input.subscribe"],
})
