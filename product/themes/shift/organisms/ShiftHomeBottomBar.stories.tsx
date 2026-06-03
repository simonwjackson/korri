/**
 * Storybook coverage for the ShiftHomeBottomBar organism — focusable
 * Menu button on the left, the static-ish HUD cluster on the right
 * (`+ Options · X Close · A Continue`). The HUD chips inside still
 * pulse on input-bus emit; press Enter / Escape / + to verify the
 * pulse against the chip your keyboard is mapped to.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftHomeBottomBar } from "./ShiftHomeBottomBar"

const meta = {
  title: "Themes/Shift/Organisms/HomeBottomBar",
  component: ShiftHomeBottomBar,
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
  },
  decorators: [
    Story => (
      <div
        data-shift-home
        style={{
          background: "var(--shift-surface)",
          minHeight: "10rem",
          paddingTop: "0.5rem",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    menuLabel: "Menu",
  },
  argTypes: {
    menuLabel: { control: "text" },
    onMenuActivate: { action: "menu activated" },
  },
} satisfies Meta<typeof ShiftHomeBottomBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
