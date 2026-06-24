import { SurfaceHost } from "@platform/surface/host/SurfaceHost"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/boxbuster")({
  component: BoxbusterRoute,
})

function BoxbusterRoute() {
  return <SurfaceHost surfaceId="boxbuster" />
}
