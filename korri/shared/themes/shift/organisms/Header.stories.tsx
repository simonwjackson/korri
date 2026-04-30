import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { Header } from "./Header"

const meta = {
  title: "Themes/Shift/Organisms/Header",
  component: Header,
  parameters: { layout: "fullscreen" },
  args: {
    currentTime: "10:42",
    isDark: true,
    onToggleTheme: () => {},
  },
} satisfies Meta<typeof Header>

export default meta
type Story = StoryObj<typeof meta>

export const Dark: Story = { args: { isDark: true } }
export const Light: Story = { args: { isDark: false } }

function Interactive() {
  const [isDark, setIsDark] = useState(true)
  return (
    <Header
      currentTime="10:42"
      isDark={isDark}
      onToggleTheme={() => setIsDark(prev => !prev)}
    />
  )
}

export const Clickable: Story = { render: () => <Interactive /> }
