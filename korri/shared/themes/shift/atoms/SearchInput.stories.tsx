import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { SearchInput } from "./SearchInput"

const meta = {
  title: "Themes/Shift/Atoms/SearchInput",
  component: SearchInput,
  parameters: { layout: "centered" },
  args: { value: "", onChange: () => {} },
  decorators: [
    Story => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchInput>

export default meta
type Story = StoryObj<typeof meta>

function Controlled({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return <SearchInput value={value} onChange={e => setValue(e.target.value)} />
}

export const Empty: Story = { render: () => <Controlled initial="" /> }
export const WithValue: Story = {
  render: () => <Controlled initial="crystalline" />,
}
