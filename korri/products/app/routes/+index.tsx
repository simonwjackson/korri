import { HomeServerRoot } from "@app/features/home/HomeServerRoot"
import { ShiftHomePage } from "@shared/themes/shift/pages/ShiftHomePage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomeRoute,
})

/**
 * Thin route shell. The Shift theme owns the home page composition;
 * this file only chooses which page to render at `/`.
 */
function HomeRoute() {
  return (
    <HomeServerRoot>
      <ShiftHomePage />
    </HomeServerRoot>
  )
}
