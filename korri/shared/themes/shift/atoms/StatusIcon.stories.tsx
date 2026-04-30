import type { Meta, StoryObj } from "@storybook/react-vite"
import { Battery, Volume2, Wifi } from "lucide-react"
import { StatusIcon } from "./StatusIcon"

const meta = {
  title: "Themes/Shift/Atoms/StatusIcon",
  component: StatusIcon,
  parameters: { layout: "centered" },
} satisfies Meta<typeof StatusIcon>

export default meta
type Story = StoryObj<typeof meta>

export const WiFi: Story = { args: { icon: Wifi, ariaLabel: "WiFi" } }
export const BatteryFull: Story = {
  args: { icon: Battery, ariaLabel: "Battery" },
}
export const Volume: Story = { args: { icon: Volume2, ariaLabel: "Volume" } }
