/**
 * Storybook coverage for the ShiftHomeRoot template — the layout
 * shell that wraps every Shift home composition in a `<main
 * data-shift-home>` host with a flex-column body.
 *
 * The story renders the Root with three deliberately stub `<section>`
 * children labelled "TopBar slot", "Middle slot", and "BottomBar
 * slot" so reviewers see the layout demo, not a half-built page.
 * Real organism stories live alongside their organisms; this story
 * is for the shell itself.
 *
 * Viewport presets mirror ShiftHomePage so reviewers can verify the
 * shell scales at every Shift target size.
 */

import { games } from "@platform/fixtures/games/games"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftHomeRoot } from "./ShiftHomeRoot"

const meta = {
  title: "Themes/Shift/Templates/Home Skeleton",
  component: ShiftHomeRoot,
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
    viewport: {
      defaultViewport: "fullhd",
      viewports: {
        fullhd: {
          name: "1080p (10ft)",
          styles: { width: "1920px", height: "1080px" },
          type: "desktop",
        },
        hd: {
          name: "720p",
          styles: { width: "1280px", height: "720px" },
          type: "desktop",
        },
        tablet: {
          name: "Tablet",
          styles: { width: "900px", height: "1200px" },
          type: "tablet",
        },
        handheld: {
          name: "Handheld",
          styles: { width: "420px", height: "720px" },
          type: "mobile",
        },
      },
    },
  },
  args: {
    items: games,
    children: null,
  },
} satisfies Meta<typeof ShiftHomeRoot>

export default meta
type Story = StoryObj<typeof meta>

const slotStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--shift-ink-dim)",
  fontSize: "1.5rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  border: "1px dashed var(--shift-rule)",
  borderRadius: "var(--shift-radius-tile)",
  margin: "1rem",
}

export const Skeleton: Story = {
  render: () => (
    <ShiftHomeRoot items={games}>
      <section style={{ ...slotStyle, height: "5rem" }}>TopBar slot</section>
      <section style={{ ...slotStyle, flex: 1 }}>Middle slot</section>
      <section style={{ ...slotStyle, height: "5rem" }}>BottomBar slot</section>
    </ShiftHomeRoot>
  ),
}
