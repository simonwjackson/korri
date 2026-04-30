import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { StatusBar } from "./StatusBar"

const meta = {
  title: "Themes/Shift/Molecules/StatusBar",
  component: StatusBar,
  parameters: { layout: "centered" },
  args: {
    isDark: true,
    onToggleTheme: () => {},
    avatarSrc: "https://i.pravatar.cc/80",
  },
} satisfies Meta<typeof StatusBar>

export default meta
type Story = StoryObj<typeof meta>

export const Dark: Story = { args: { isDark: true } }
export const Light: Story = { args: { isDark: false } }

function Interactive() {
  const [isDark, setIsDark] = useState(true)
  return (
    <StatusBar
      isDark={isDark}
      onToggleTheme={() => setIsDark(prev => !prev)}
      avatarSrc="https://i.pravatar.cc/80"
    />
  )
}

export const Clickable: Story = { render: () => <Interactive /> }
