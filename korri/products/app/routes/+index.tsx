import { ShiftHomePage } from "@shared/themes/shift/pages/ShiftHomePage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomeRoute,
})

/**
 * Thin route shell. The Shift theme owns the home page composition;
 * this file only chooses which page to render at `/`.
 *
 * Launcher and library-source layers are seeded once at the React
 * composition root in `korri/deploy/portal/main.tsx` via
 * `<RegistryProvider initialValues={…}>`, so route components no
 * longer need to wrap their pages in a layer-installing component.
 */
function HomeRoute() {
  return <ShiftHomePage />
}
