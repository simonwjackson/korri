import { games } from "@shared/fixtures/games/games"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ShiftLabsButton } from "../molecules/ShiftLabsButton"
import { ShiftUiScaleControl } from "../molecules/ShiftUiScaleControl"
import { useShiftHome } from "../templates/ShiftHome.context"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"
import { ShiftLabsPanel } from "./ShiftLabsPanel"

const meta = {
  title: "Themes/Shift/Organisms/LabsPanel",
  component: ShiftLabsPanel,
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
  },
  decorators: [
    Story => (
      <ShiftHomeRoot items={games}>
        <div className="flex min-h-screen items-start justify-end bg-[color:var(--shift-surface)] p-12">
          <OpenLabsAction />
          <Story />
        </div>
      </ShiftHomeRoot>
    ),
  ],
} satisfies Meta<typeof ShiftLabsPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => <ConnectedLabsPanel />,
}

function OpenLabsAction() {
  const { openLabs } = useShiftHome()
  return <ShiftLabsButton onActivate={openLabs} />
}

function ConnectedLabsPanel() {
  const { uiScale, changeUiScale, resetUiScale } = useShiftHome()

  return (
    <ShiftLabsPanel>
      <ShiftUiScaleControl
        value={uiScale}
        onChange={changeUiScale}
        onReset={resetUiScale}
      />
    </ShiftLabsPanel>
  )
}
