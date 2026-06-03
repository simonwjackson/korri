import { HomeRuntimeLayersRoot } from "@app/features/home/HomeRuntimeLayersRoot"
import { ShiftHomePage } from "@product/themes/shift/pages/ShiftHomePage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomeRoute,
})

/**
 * Thin route shell. The Shift theme owns the home page composition;
 * this file only chooses which page to render at `/`.
 *
 * Launcher and library-source layers are seeded at the route root so
 * code-split route chunks install the layers in the same atom registry
 * instance that the page hooks read from.
 */
function HomeRoute() {
  return (
    <HomeRuntimeLayersRoot>
      <ShiftHomePage />
    </HomeRuntimeLayersRoot>
  )
}
