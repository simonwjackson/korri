import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import {
  ShiftUiScaleControl,
  type ShiftUiScaleControlProps,
} from "./ShiftUiScaleControl"

const meta = {
  title: "Themes/Shift/Molecules/UiScaleControl",
  component: ShiftUiScaleControl,
  parameters: {
    layout: "centered",
    backgrounds: { disable: true },
  },
  decorators: [
    Story => (
      <div
        data-shift-home
        style={{
          background: "var(--shift-surface)",
          padding: "2rem",
          borderRadius: "1rem",
          width: "40rem",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    value: 1,
    onChange: () => {},
  },
  argTypes: {
    value: { control: { type: "range", min: 0.75, max: 1.5, step: 0.05 } },
    onChange: { action: "scale changed" },
    onReset: { action: "scale reset" },
  },
} satisfies Meta<typeof ShiftUiScaleControl>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: args => <UiScaleControlDemo {...args} />,
}

function UiScaleControlDemo(args: ShiftUiScaleControlProps) {
  const [value, setValue] = useState(args.value)

  return (
    <ShiftUiScaleControl
      {...args}
      value={value}
      onChange={setValue}
      onReset={() => setValue(1)}
    />
  )
}
