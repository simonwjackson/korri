/**
 * Storybook coverage for the Shift pill atom.
 *
 * The pill is the focusable button base behind every header/footer
 * affordance — search, menu, and any future chrome control. The story's
 * job is to give reviewers a single, isolated surface to:
 *
 *   - Tab into the pill and see the lavender focus halo.
 *   - Toggle the light/dark toolbar and verify both modes.
 *   - Inspect the typography token consumed via `.shift-pill`.
 *
 * Every Shift class hook is scoped under `[data-shift-home]`, so the
 * decorator wraps the rendered atom in a host attribute or the styling
 * silently no-ops. This is the same scoping contract every Shift story
 * follows.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftPill } from "./ShiftPill"

const meta = {
  title: "Themes/Shift/Atoms/Pill",
  component: ShiftPill,
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
    children: "Search games",
  },
  argTypes: {
    children: { control: "text" },
  },
} satisfies Meta<typeof ShiftPill>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
