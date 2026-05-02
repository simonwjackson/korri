/**
 * Storybook coverage for the ShiftHomePosterTile molecule — the 1:1
 * cover image used for non-resume tiles. Two stories so reviewers see
 * both branches:
 *
 *   - WithCover: a fixture game that has an image (the common case).
 *   - Fallback: a synthesised game whose media array is empty, to
 *     verify the muted-name fallback renders correctly.
 *
 * Both render inside a 240x240 frame matching the rail's single-cell
 * poster slot.
 */

import type { GameRecord } from "@shared/fixtures/games/game"
import { games } from "@shared/fixtures/games/games"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftHomePosterTile } from "./ShiftHomePosterTile"

const fallbackGame: GameRecord = {
  id: "missing-art-demo",
  metadata: {
    name: "Quietude",
    developer: "Demo Studio",
    publisher: "Demo Press",
    releaseDate: "2025-01-01",
    genre: ["Demo"],
    tags: ["fallback"],
    media: [],
  },
}

const meta = {
  title: "Themes/Shift/Molecules/HomePosterTile",
  component: ShiftHomePosterTile,
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
            width: 240,
            height: 240,
            overflow: "hidden",
            borderRadius: "var(--shift-radius-tile)",
            background: "var(--shift-surface-sunk)",
          }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ShiftHomePosterTile>

export default meta
type Story = StoryObj<typeof meta>

export const WithCover: Story = {
  args: { game: games[1] },
}

export const Fallback: Story = {
  args: { game: fallbackGame },
}
