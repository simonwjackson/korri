import type { Meta, StoryObj } from "@storybook/react-vite"
import { Moon, Sun } from "lucide-react"
import { useState } from "react"
import { ToggleIconButton } from "./ToggleIconButton"

const meta = {
  title: "Themes/Shift/Atoms/ToggleIconButton",
  component: ToggleIconButton,
  parameters: { layout: "centered" },
  args: {
    on: true,
    iconOn: Sun,
    iconOff: Moon,
    onClick: () => {},
    ariaLabel: "Toggle color mode",
  },
} satisfies Meta<typeof ToggleIconButton>

export default meta
type Story = StoryObj<typeof meta>

function Interactive() {
  const [on, setOn] = useState(true)
  return (
    <ToggleIconButton
      on={on}
      iconOn={Sun}
      iconOff={Moon}
      onClick={() => setOn(prev => !prev)}
      ariaLabel="Toggle color mode"
    />
  )
}

export const ThemeToggle: Story = { render: () => <Interactive /> }
export const On: Story = { args: { on: true } }
export const Off: Story = { args: { on: false } }
