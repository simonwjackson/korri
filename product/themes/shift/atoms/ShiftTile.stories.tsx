/**
 * Storybook coverage for the Shift tile atom.
 *
 * The tile is the focusable cell that lives inside the home rail. Its
 * focus-ring contract is the `::after` pseudo-element border, *not* a
 * negative-offset outline — see
 * docs/solutions/ui-bugs/inset-outline-clipped-by-overflow-hidden-2026-05-01.md.
 * That bug is regression-prone because `overflow: hidden` on the tile
 * (required for the inner image) clips inset outlines. This story is
 * the canonical visual surface for catching that regression: Tab into
 * the tile and verify the lavender ring is visible on all four edges.
 *
 * The tile has no intrinsic dimensions (TilegridCells contributes
 * inline `width`/`height` from the grid). The story sizes it with a
 * realistic 240x240 placeholder so the focus ring visualises against
 * actual content rather than an empty button.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftTile } from "./ShiftTile"

const meta = {
  title: "Themes/Shift/Atoms/Tile",
  component: ShiftTile,
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
    style: { width: 240, height: 240 },
    "aria-label": "Shift tile demo",
  },
  render: args => (
    <ShiftTile {...args}>
      <img
        src="https://picsum.photos/seed/shift-tile-story/480/480"
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </ShiftTile>
  ),
} satisfies Meta<typeof ShiftTile>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
