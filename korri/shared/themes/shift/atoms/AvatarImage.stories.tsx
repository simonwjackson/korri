import type { Meta, StoryObj } from "@storybook/react-vite"
import { AvatarImage } from "./AvatarImage"

const meta = {
  title: "Themes/Shift/Atoms/AvatarImage",
  component: AvatarImage,
  parameters: { layout: "centered" },
  args: { src: "https://i.pravatar.cc/80", alt: "User avatar" },
} satisfies Meta<typeof AvatarImage>

export default meta
type Story = StoryObj<typeof meta>

export const Small: Story = { args: { size: 24 } }
export const Medium: Story = { args: { size: 40 } }
export const Large: Story = { args: { size: 64 } }
