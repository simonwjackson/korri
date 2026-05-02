/**
 * Storybook coverage for the ShiftHomeCaption molecule.
 *
 * The caption reads its content from `useShiftHome()`, so the story
 * wraps it in a real `ShiftHomeRoot` backed by the games fixture
 * (per the plan's R6: no mock Provider, no helper module). Two
 * stories surface the caption's two semantic states:
 *
 *   - ResumeFocused: focused tile === resumeTarget. Caption shows
 *     "{name} {Xm ago}" — the relative-played pill is appended.
 *   - NonResumeFocused: focused tile !== resumeTarget. Caption shows
 *     just the focused game's name.
 *
 * The non-resume case calls `focusTile()` once on mount via a tiny
 * sibling component. The Root's focus-on-mount useEffect early-returns
 * because the caption story does not own a `railRef` target, so no
 * actual DOM focus moves; only the context's `focusedId` updates.
 */

import { games } from "@shared/fixtures/games/games"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect } from "react"
import { useShiftHome } from "../templates/ShiftHome.context"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"
import { ShiftHomeCaption } from "./ShiftHomeCaption"

function Focuser({ id }: { readonly id: string }) {
  const { focusTile } = useShiftHome()
  useEffect(() => {
    focusTile(id)
  }, [focusTile, id])
  return null
}

const meta = {
  title: "Themes/Shift/Molecules/HomeCaption",
  component: ShiftHomeCaption,
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
  },
} satisfies Meta<typeof ShiftHomeCaption>

export default meta
type Story = StoryObj<typeof meta>

export const ResumeFocused: Story = {
  render: () => (
    <ShiftHomeRoot items={games}>
      <div className="flex h-full items-center">
        <ShiftHomeCaption />
      </div>
    </ShiftHomeRoot>
  ),
}

export const NonResumeFocused: Story = {
  render: () => (
    <ShiftHomeRoot items={games}>
      <Focuser id={games[1].id} />
      <div className="flex h-full items-center">
        <ShiftHomeCaption />
      </div>
    </ShiftHomeRoot>
  ),
}
