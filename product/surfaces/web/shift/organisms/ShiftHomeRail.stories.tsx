/**
 * Storybook coverage for the ShiftHomeRail organism.
 *
 * The rail consumes `useShiftHome()` (items, resumeTarget, railRef,
 * focusTile), so the story wraps it in a real ShiftHomeRoot backed
 * by the games fixture — same Root the product route renders. The
 * Root's focus-on-mount useEffect fires here too, so the resume
 * target is focused on render and arrow keys traverse the rail.
 *
 * Viewport presets mirror ShiftHomePage so reviewers can sweep the
 * 1080p / 720p / Tablet / Handheld scaling at the rail level
 * without loading the full page.
 */

import { games } from "@platform/fixtures/games/games"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"
import { ShiftHomeRail } from "./ShiftHomeRail"

const meta = {
  title: "Themes/Shift/Organisms/HomeRail",
  component: ShiftHomeRail,
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
} satisfies Meta<typeof ShiftHomeRail>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <ShiftHomeRoot items={games}>
      <div className="flex h-full items-center">
        <ShiftHomeRail />
      </div>
    </ShiftHomeRoot>
  ),
}
