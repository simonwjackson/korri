/**
 * Storybook coverage for the ShiftHomeTopBar organism — search pill
 * on the left, decorative status cluster on the right. Time, avatar
 * source, and search copy are all controllable so reviewers can
 * verify spacing across realistic input ranges.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftHomeTopBar } from "./ShiftHomeTopBar"

const meta = {
  title: "Themes/Shift/Organisms/HomeTopBar",
  component: ShiftHomeTopBar,
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
    time: "9:41",
    avatarSrc: "https://picsum.photos/seed/shift-avatar-story/96/96",
  },
  argTypes: {
    time: { control: "text" },
    avatarSrc: { control: "text" },
    searchPlaceholder: { control: "text" },
    searchAriaLabel: { control: "text" },
    onSearchActivate: { action: "search activated" },
  },
} satisfies Meta<typeof ShiftHomeTopBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
