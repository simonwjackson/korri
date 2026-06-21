import { SurfaceHost } from "@platform/surface/host/SurfaceHost"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/evier")({
  component: EvierRoute,
})

function EvierRoute() {
  return <SurfaceHost surfaceId="evier" />
}
