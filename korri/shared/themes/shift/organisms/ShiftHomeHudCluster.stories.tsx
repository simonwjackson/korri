/**
 * Storybook coverage for the ShiftHomeHudCluster organism — the
 * canonical Switch-home HUD trio `+ Options · X Close · A Continue`.
 * Two ShiftHudButton instances pulse on input-bus emit; the static
 * X chip is decorative.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftHomeHudCluster } from "./ShiftHomeHudCluster"

const meta = {
  title: "Themes/Shift/Organisms/HomeHudCluster",
  component: ShiftHomeHudCluster,
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
} satisfies Meta<typeof ShiftHomeHudCluster>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
