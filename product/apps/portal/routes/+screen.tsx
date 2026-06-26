import { SurfaceHost } from "@platform/surface/host/SurfaceHost"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/screen")({
  component: ScreenRoute,
})

function ScreenRoute() {
  return <SurfaceHost surfaceId="shift" />
}
