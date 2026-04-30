import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { PageDots } from "./PageDots"

const meta = {
  title: "Themes/Shift/Molecules/PageDots",
  component: PageDots,
  parameters: { layout: "centered" },
  args: { total: 5, active: 1 },
} satisfies Meta<typeof PageDots>

export default meta
type Story = StoryObj<typeof meta>

export const FivePages: Story = {}
export const SinglePage: Story = { args: { total: 1, active: 0 } }
export const ManyPages: Story = { args: { total: 12, active: 6 } }

function Interactive() {
  const [active, setActive] = useState(0)
  return <PageDots total={6} active={active} onSelect={setActive} />
}

export const Clickable: Story = { render: () => <Interactive /> }
