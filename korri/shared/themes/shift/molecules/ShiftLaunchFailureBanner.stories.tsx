/**
 * Storybook coverage for ShiftLaunchFailureBanner.
 *
 * The banner has three independent axes (game title, exit code presence,
 * dismiss button presence). Per
 * docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md
 * the primary surface is a single Playground exposing them as controls.
 * Two named stories pin the most-likely live combinations for quick
 * visual reference.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"

import { ShiftLaunchFailureBanner } from "./ShiftLaunchFailureBanner"

const meta = {
  title: "Themes/Shift/Molecules/LaunchFailureBanner",
  component: ShiftLaunchFailureBanner,
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
    onRetry: () => {},
  },
  argTypes: {
    gameTitle: { control: "text" },
    exitCode: { control: "number" },
    onRetry: { action: "retry" },
    onDismiss: { action: "dismiss" },
  },
} satisfies Meta<typeof ShiftLaunchFailureBanner>

export default meta

type Story = StoryObj<typeof meta>

/** Most-common state: the launch failed and the player has retry available. */
export const Default: Story = {}

/** Failure with a known exit code surfaced to the player. */
export const WithExitCode: Story = {
  args: {
    exitCode: 7,
  },
}

/** Failure with both retry and dismiss available. */
export const WithDismiss: Story = {
  args: {
    exitCode: 1,
    onDismiss: () => {},
  },
}

/** Stress the layout with a long title. */
export const LongTitle: Story = {
  args: {
    gameTitle:
      "Castlevania: Symphony of the Night — Definitive Anniversary Edition",
    exitCode: 2,
  },
}
