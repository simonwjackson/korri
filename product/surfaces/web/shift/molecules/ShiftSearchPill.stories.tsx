/**
 * Storybook coverage for the ShiftSearchPill molecule.
 *
 * The pill collapses to a quiet icon at rest and expands to reveal
 * the placeholder when focused — both states are CSS-driven, so the
 * single Default story is sufficient: Tab into the pill to see the
 * expansion, Tab away to see the collapse.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftSearchPill } from "./ShiftSearchPill"

const meta = {
  title: "Themes/Shift/Molecules/SearchPill",
  component: ShiftSearchPill,
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
    placeholder: "Search games",
    ariaLabel: "Search the library",
  },
  argTypes: {
    placeholder: { control: "text" },
    ariaLabel: { control: "text" },
    onActivate: { action: "search activated" },
  },
} satisfies Meta<typeof ShiftSearchPill>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
