import { defineSurface } from "@platform/surface/surface-manifest"

export const evierSurface = defineSurface({
  id: "@korri:evier",
  kind: "surface",
  medium: "web",
  consumes: [
    "catalog.read",
    "library.launch",
    "session.read",
    "session.stop",
    "stream-control.read",
    "stream-control.write",
    "input.subscribe",
  ],
})
