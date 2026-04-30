import type { Meta, StoryObj } from "@storybook/react-vite"
import { ScaleProvider } from "../context/ScaleContext"
import { games } from "../fixtures/games"
import { navigationTabs } from "../fixtures/nav"
import { FeaturedGameGrid } from "../organisms/FeaturedGameGrid"
import { FooterActions } from "../organisms/FooterActions"
import { Header } from "../organisms/Header"
import { Navigation } from "../organisms/Navigation"
import { FeaturedTemplate } from "./FeaturedTemplate"

const meta = {
  title: "Themes/Shift/Templates/FeaturedTemplate",
  component: FeaturedTemplate,
  parameters: { layout: "fullscreen" },
  args: { header: null, content: null },
} satisfies Meta<typeof FeaturedTemplate>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <ScaleProvider>
      <FeaturedTemplate
        header={<Header currentTime="10:42" isDark onToggleTheme={() => {}} />}
        navigation={
          <Navigation
            tabs={navigationTabs}
            activeTab={navigationTabs[1] ?? ""}
            onTabChange={() => {}}
          />
        }
        content={<FeaturedGameGrid games={games} onGameClick={() => {}} />}
        footer={<FooterActions />}
      />
    </ScaleProvider>
  ),
}
