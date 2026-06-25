/**
 * Storybook coverage for the ShiftMenuButton molecule — the focusable
 * menu glyph that sits opposite the HUD cluster. Tab into it to verify
 * the focus halo on the glyph badge.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftMenuButton } from "./ShiftMenuButton"

const meta = {
  title: "Themes/Shift/Molecules/MenuButton",
  component: ShiftMenuButton,
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
    label: "Menu",
  },
  argTypes: {
    label: { control: "text" },
    onActivate: { action: "menu activated" },
  },
} satisfies Meta<typeof ShiftMenuButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
