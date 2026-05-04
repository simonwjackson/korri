import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftLabsButton } from "./ShiftLabsButton"

const meta = {
  title: "Themes/Shift/Molecules/LabsButton",
  component: ShiftLabsButton,
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
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    label: "Labs",
  },
  argTypes: {
    label: { control: "text" },
    onActivate: { action: "labs activated" },
  },
} satisfies Meta<typeof ShiftLabsButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
