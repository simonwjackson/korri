import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftForegroundSessionGateNotice } from "./ShiftForegroundSessionGateNotice"

const meta = {
  title: "Themes/Shift/Molecules/ForegroundSessionGateNotice",
  component: ShiftForegroundSessionGateNotice,
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
          minWidth: "640px",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    gameTitle: "Hades",
    state: { _tag: "Blocked", reason: "running", gameId: "hades" },
  },
} satisfies Meta<typeof ShiftForegroundSessionGateNotice>

export default meta

type Story = StoryObj<typeof meta>

export const Running: Story = {}

export const Cooling: Story = {
  args: {
    state: { _tag: "Blocked", reason: "cooling", gameId: "hades" },
  },
}

export const Recovering: Story = {
  args: {
    state: {
      _tag: "Blocked",
      reason: "recovering",
      gameId: "hades",
      message: "surface remained visible",
    },
  },
}

export const UnknownStatus: Story = {
  args: {
    state: { _tag: "AllowedWithUnknownStatus", message: "HTTP 500" },
  },
}
