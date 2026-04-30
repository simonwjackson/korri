import type { Meta, StoryObj } from "@storybook/react-vite"
import { Card } from "./Card"

const meta = {
  title: "Themes/Shift/Atoms/Card",
  component: Card,
  parameters: { layout: "centered" },
  args: {
    imageUrl: "https://picsum.photos/seed/shift-card/300/300",
    alt: "Sample card image",
  },
  decorators: [
    Story => (
      <div className="w-40">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoImage: Story = {
  args: { imageUrl: undefined },
}
