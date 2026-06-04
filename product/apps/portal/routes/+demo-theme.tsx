import { ThemeHost } from "@product/apps/portal/themes/ThemeHost"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/demo-theme")({
  component: DemoThemeRoute,
})

function DemoThemeRoute() {
  return <ThemeHost themeId="plain-demo" />
}
