import { defineSurface } from "@platform/surface/surface-manifest"

export const vigieSurface = defineSurface({
  id: "@korri:vigie",
  kind: "surface",
  medium: "web",
  consumes: ["catalog.read", "session.read", "input.subscribe"],
})
