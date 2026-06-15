import { ThemeHost } from "@product/apps/portal/themes/ThemeHost"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/vigie")({
  component: VigieRoute,
})

function VigieRoute() {
  return <ThemeHost themeId="vigie" />
}
