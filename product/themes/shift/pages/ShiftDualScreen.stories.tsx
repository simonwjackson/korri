import { games } from "@platform/fixtures/games/games"
import type { LaunchController } from "@platform/library/launch-state"
import { DualScreenPreviewFrame } from "@platform/react/display/dual-screen/DualScreenPreviewFrame"
import { DualScreenSessionRoot } from "@platform/react/display/dual-screen/DualScreenSessionRoot"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftCompanionScreen } from "./ShiftCompanionScreen"
import { ShiftPrimaryDualScreenSurface } from "./ShiftPrimaryDualScreenSurface"

const STORY_GAMES = games.slice(0, 12)

const meta = {
  title: "Themes/Shift/Experiments/Dual Screen",
  component: ShiftDualScreenStoryRoot,
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
      },
    },
  },
} satisfies Meta<typeof ShiftDualScreenStoryRoot>

export default meta
type Story = StoryObj<typeof meta>

export const PrimaryAndCompanion: Story = {
  name: "Primary + companion screen",
}

function ShiftDualScreenStoryRoot() {
  const initialGame = STORY_GAMES[0]
  if (!initialGame) {
    throw new Error("Shift dual-screen story requires fixture games")
  }

  return (
    <DualScreenSessionRoot initialGameId={initialGame.id}>
      <DualScreenPreviewFrame
        primary={
          <ShiftPrimaryDualScreenSurface items={STORY_GAMES} launch={launch} />
        }
        companion={<ShiftCompanionScreen items={STORY_GAMES} />}
      />
    </DualScreenSessionRoot>
  )
}

const launch: LaunchController = {
  state: { _tag: "Idle" },
  start: () => {},
  retry: () => {},
}
