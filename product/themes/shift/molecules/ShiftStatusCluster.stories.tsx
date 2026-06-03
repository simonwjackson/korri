/**
 * Storybook coverage for the ShiftStatusCluster molecule — the
 * decorative top-right group of time + status icons + avatar. Time
 * and avatar source are exposed as controls so reviewers can verify
 * spacing across realistic time-string lengths and avatar
 * resolutions.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftStatusCluster } from "./ShiftStatusCluster"

const meta = {
  title: "Themes/Shift/Molecules/StatusCluster",
  component: ShiftStatusCluster,
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
    time: "9:41",
    avatarSrc: "https://picsum.photos/seed/shift-avatar-story/96/96",
  },
  argTypes: {
    time: { control: "text" },
    avatarSrc: { control: "text" },
  },
} satisfies Meta<typeof ShiftStatusCluster>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
