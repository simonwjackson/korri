import type { Meta, StoryObj } from "@storybook/react-vite"
import { ScaleProvider } from "../context/ScaleContext"
import { games } from "../fixtures/games"
import { filterChips, navigationTabs } from "../fixtures/nav"
import { Footer } from "../organisms/Footer"
import { GameFilterBar } from "../organisms/GameFilterBar"
import { GameGrid } from "../organisms/GameGrid"
import { Header } from "../organisms/Header"
import { Navigation } from "../organisms/Navigation"
import { LibraryTemplate } from "./LibraryTemplate"

const meta = {
  title: "Themes/Shift/Templates/LibraryTemplate",
  component: LibraryTemplate,
  parameters: { layout: "fullscreen" },
  args: { header: null, content: null },
} satisfies Meta<typeof LibraryTemplate>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <ScaleProvider>
      <LibraryTemplate
        header={<Header currentTime="10:42" isDark onToggleTheme={() => {}} />}
        navigation={
          <Navigation
            tabs={navigationTabs}
            activeTab={navigationTabs[0] ?? ""}
            onTabChange={() => {}}
          />
        }
        filterBar={
          <GameFilterBar
            filters={filterChips}
            activeFilter={filterChips[0] ?? "All"}
            onFilterChange={() => {}}
            viewMode="grid"
            onViewModeChange={() => {}}
            gameCount={games.length}
          />
        }
        content={
          <GameGrid games={games} viewMode="grid" onGameClick={() => {}} />
        }
        footer={<Footer />}
      />
    </ScaleProvider>
  ),
}
