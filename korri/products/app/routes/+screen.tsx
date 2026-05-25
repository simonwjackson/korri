import {
  DualScreenRouteRoot,
  parseDualScreenRouteRole,
} from "@app/features/dual-screen/DualScreenRouteRoot"
import { HomeRuntimeLayersRoot } from "@app/features/home/HomeRuntimeLayersRoot"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/screen")({
  component: ScreenRoute,
})

function ScreenRoute() {
  const search = Route.useSearch()
  const role = parseDualScreenRouteRole(
    typeof search === "object" && search !== null && "role" in search
      ? search.role
      : undefined,
  )

  return (
    <HomeRuntimeLayersRoot>
      <DualScreenRouteRoot screenRole={role} />
    </HomeRuntimeLayersRoot>
  )
}
