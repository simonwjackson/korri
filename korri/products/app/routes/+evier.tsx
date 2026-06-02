import { EvierStreamControlPage } from "@shared/themes/evier/pages/EvierStreamControlPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/evier")({
  component: EvierRoute,
})

function EvierRoute() {
  return <EvierStreamControlPage />
}
