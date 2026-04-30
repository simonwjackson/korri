import type { Meta, StoryObj } from "@storybook/react-vite"
import { games } from "../fixtures/games"
import { FeaturedPage } from "./FeaturedPage"

const meta = {
  title: "Themes/Shift/Pages/FeaturedPage",
  component: FeaturedPage,
  parameters: { layout: "fullscreen" },
  args: {
    data: { games, currentTime: "10:42", isDark: true },
    onToggleTheme: () => {},
    onGameClick: () => {},
  },
} satisfies Meta<typeof FeaturedPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = {
  args: { data: { games: [], currentTime: "10:42" } },
}

export const FewGames: Story = {
  args: { data: { games: games.slice(0, 6) } },
}

export const LightMode: Story = {
  args: { data: { games, isDark: false } },
}
