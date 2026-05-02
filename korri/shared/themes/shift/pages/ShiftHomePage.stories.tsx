/**
 * Storybook composition for the Shift home page.
 *
 * Visual review surface for the graduated home — the same composition
 * the product `/` route renders, in Storybook's spatial-nav substrate.
 * Story title puts the page under `Themes/Shift/Pages/Home` so the
 * Shift hierarchy is visible in the sidebar at a glance.
 *
 * Viewport presets mirror the previous Sunlit exploration so visual
 * comparison between the parked exploration and the graduated page
 * stays a one-click toggle while both files coexist (Sunlit is
 * deleted in the cleanup unit at the end of this plan).
 */

import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftHomePage } from "./ShiftHomePage"

const meta = {
  title: "Themes/Shift/Pages/Home",
  component: ShiftHomePage,
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
} satisfies Meta<typeof ShiftHomePage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
