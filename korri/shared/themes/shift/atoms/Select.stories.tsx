import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { Select } from "./Select"

const sortOptions = [
  { label: "Recently Played", value: "lastPlayed" },
  { label: "Name", value: "name" },
  { label: "Playtime", value: "playtime" },
]

const meta = {
  title: "Themes/Shift/Atoms/Select",
  component: Select,
  parameters: { layout: "centered" },
  args: { value: "name", options: sortOptions, onChange: () => {} },
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

function Controlled() {
  const [value, setValue] = useState("name")
  return (
    <Select
      value={value}
      options={sortOptions}
      onChange={e => setValue(e.target.value)}
      ariaLabel="Sort"
    />
  )
}

export const Default: Story = { render: () => <Controlled /> }
