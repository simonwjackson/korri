/**
 * Storybook coverage for the ShiftHomeFeatureTile molecule — the wide
 * landscape image that fills the resume target's tile in the rail.
 * Renders inside a 16:9 frame matching the rail's two-column feature
 * cell so the deterministic Picsum landscape is sized realistically.
 */

import { games } from "@shared/fixtures/games/games"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftHomeFeatureTile } from "./ShiftHomeFeatureTile"

const meta = {
  title: "Themes/Shift/Molecules/HomeFeatureTile",
  component: ShiftHomeFeatureTile,
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
        <div
          style={{
            width: 480,
            height: 270,
            overflow: "hidden",
            borderRadius: "var(--shift-radius-tile)",
          }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    game: games[0],
  },
} satisfies Meta<typeof ShiftHomeFeatureTile>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
