import { ScaleProvider } from "@shared/themes/shift/context/ScaleContext"
import { games } from "@shared/themes/shift/fixtures/games"
import { GameGrid } from "@shared/themes/shift/organisms/GameGrid"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    <ScaleProvider>
      <div className="h-screen w-screen p-4">
        <GameGrid games={games} viewMode="grid" />
      </div>
    </ScaleProvider>
  )
}
