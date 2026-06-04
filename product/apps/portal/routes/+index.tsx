import { ThemeHost } from "@product/apps/portal/themes/ThemeHost"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomeRoute,
})

function HomeRoute() {
  return <ThemeHost themeId="shift" />
}
