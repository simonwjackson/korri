import type { Meta, StoryObj } from "@storybook/react-vite"
import { games } from "../fixtures/games"
import { LibraryPage } from "./LibraryPage"

const meta = {
  title: "Themes/Shift/Pages/LibraryPage",
  component: LibraryPage,
  parameters: { layout: "fullscreen" },
  args: {
    data: { games, currentTime: "10:42", isDark: true },
    onToggleTheme: () => {},
    onGameClick: () => {},
  },
} satisfies Meta<typeof LibraryPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = {
  args: {
    data: { games: [], currentTime: "10:42", isDark: true },
  },
}

export const ListView: Story = {
  args: {
    data: { games, initialViewMode: "list" },
  },
}

export const FeaturedView: Story = {
  args: {
    data: { games, initialViewMode: "featured" },
  },
}

export const LightMode: Story = {
  args: {
    data: { games, isDark: false },
  },
}
