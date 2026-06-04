import { ThemeHost } from "@product/apps/portal/themes/ThemeHost"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/evier")({
  component: EvierRoute,
})

function EvierRoute() {
  return <ThemeHost themeId="evier" />
}
