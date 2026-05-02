/**
 * Storybook coverage for the ShiftHudButton molecule.
 *
 * One control-driven Playground per
 * docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md
 * — the chip's three independent axes (semantic action × glyph string
 * × label string) would multiply into ~9 near-duplicate stories
 * otherwise. The Playground exposes them as Storybook controls so
 * reviewers can sweep the space themselves.
 *
 * Reviewers can verify the pulse behavior by pressing the keyboard
 * equivalent of the selected `action`:
 *
 *   - `confirm` → Enter
 *   - `back`    → Escape
 *   - `options` → +
 *
 * The chip animates `data-active` for ~220ms; behavioral coverage of
 * that timer lives in ShiftHudButton.test.tsx.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ShiftHudAction, ShiftHudButton } from "./ShiftHudButton"

const ACTIONS: ReadonlyArray<ShiftHudAction> = ["confirm", "back", "options"]

const meta = {
  title: "Themes/Shift/Molecules/HudButton",
  component: ShiftHudButton,
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
    action: "confirm",
    glyph: "A",
    label: "Continue",
  },
  argTypes: {
    action: {
      control: "select",
      options: ACTIONS,
      description: "Semantic input bus action this chip subscribes to",
    },
    glyph: {
      control: "text",
      description: "Single-character glyph painted in the round badge",
    },
    label: {
      control: "text",
      description: "Trailing label after the glyph",
    },
  },
} satisfies Meta<typeof ShiftHudButton>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}
