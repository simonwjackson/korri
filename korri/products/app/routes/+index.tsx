import { games } from "@shared/themes/shift/fixtures/games"
import { LibraryPage } from "@shared/themes/shift/pages/LibraryPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return <LibraryPage data={{ games }} />
}
