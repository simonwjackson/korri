import { defineSurface } from "@platform/surface/surface-manifest"

export const cliSurface = defineSurface({
  id: "@korri:cli",
  kind: "surface",
  medium: "terminal",
  consumes: [
    "catalog.read",
    "library.launch",
    "session.read",
    "session.stop",
    "stream-control.read",
  ],
})
