/**
 * STORY DISCIPLINE: stories for this page must inject `data` directly via
 * args/render. They must never instantiate or call a live RPC client. The
 * page binds whatever `data` it receives — fixture or real — to the layout.
 */
import { useState } from "react"
import { ScaleProvider } from "../context/ScaleContext"
import { filterChips, navigationTabs, type ViewMode } from "../fixtures/nav"
import { Footer } from "../organisms/Footer"
import { GameFilterBar } from "../organisms/GameFilterBar"
import { GameGrid } from "../organisms/GameGrid"
import { Header } from "../organisms/Header"
import { Navigation } from "../organisms/Navigation"
import type { GameRecord } from "../schemas/game"
import { LibraryTemplate } from "../templates/LibraryTemplate"

export interface LibraryPageData {
  games: ReadonlyArray<GameRecord>
  currentTime?: string
  isDark?: boolean
  initialTab?: string
  initialFilter?: string
  initialViewMode?: ViewMode
}

export interface LibraryPageProps {
  data: LibraryPageData
  onToggleTheme?: () => void
  onGameClick?: (game: GameRecord) => void
}

export function LibraryPage({
  data,
  onToggleTheme = () => {},
  onGameClick = () => {},
}: LibraryPageProps) {
  const {
    games,
    currentTime = "10:42",
    isDark = true,
    initialTab = navigationTabs[0] ?? "Library",
    initialFilter = filterChips[0] ?? "All",
    initialViewMode = "grid",
  } = data

  const [activeTab, setActiveTab] = useState(initialTab)
  const [activeFilter, setActiveFilter] = useState(initialFilter)
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode)

  return (
    <ScaleProvider>
      <LibraryTemplate
        header={
          <Header
            currentTime={currentTime}
            isDark={isDark}
            onToggleTheme={onToggleTheme}
          />
        }
        navigation={
          <Navigation
            tabs={navigationTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        filterBar={
          <GameFilterBar
            filters={filterChips}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            gameCount={games.length}
          />
        }
        content={
          <GameGrid
            games={games}
            viewMode={viewMode}
            onGameClick={onGameClick}
          />
        }
        footer={<Footer />}
      />
    </ScaleProvider>
  )
}
