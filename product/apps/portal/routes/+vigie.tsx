import { SurfaceHost } from "@platform/surface/host/SurfaceHost"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/vigie")({
  component: VigieRoute,
})

function VigieRoute() {
  return <SurfaceHost surfaceId="vigie" />
}
