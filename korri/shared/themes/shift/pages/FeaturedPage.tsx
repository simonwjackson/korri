/**
 * STORY DISCIPLINE: stories for this page must inject `data` directly via
 * args/render. They must never instantiate or call a live RPC client. The
 * page binds whatever `data` it receives — fixture or real — to the layout.
 */
import { useState } from "react"
import { ScaleProvider } from "../context/ScaleContext"
import { navigationTabs } from "../fixtures/nav"
import { FeaturedGameGrid } from "../organisms/FeaturedGameGrid"
import { FooterActions } from "../organisms/FooterActions"
import { Header } from "../organisms/Header"
import { Navigation } from "../organisms/Navigation"
import type { GameRecord } from "../schemas/game"
import { FeaturedTemplate } from "../templates/FeaturedTemplate"

export interface FeaturedPageData {
  games: ReadonlyArray<GameRecord>
  currentTime?: string
  isDark?: boolean
  initialTab?: string
}

export interface FeaturedPageProps {
  data: FeaturedPageData
  onToggleTheme?: () => void
  onGameClick?: (game: GameRecord) => void
}

export function FeaturedPage({
  data,
  onToggleTheme = () => {},
  onGameClick = () => {},
}: FeaturedPageProps) {
  const {
    games,
    currentTime = "10:42",
    isDark = true,
    initialTab = navigationTabs[1] ?? "Featured",
  } = data

  const [activeTab, setActiveTab] = useState(initialTab)

  return (
    <ScaleProvider>
      <FeaturedTemplate
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
        content={<FeaturedGameGrid games={games} onGameClick={onGameClick} />}
        footer={<FooterActions />}
      />
    </ScaleProvider>
  )
}
