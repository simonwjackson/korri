import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { ControlCenter } from "../organisms/ControlCenter"
import { MiniHome } from "../organisms/MiniHome"
import { PanelScreen } from "./PanelScreen"

const rail = picoGames.slice(0, 5)

export default {
  note: "push-drawer shell",
  render: () => (
    <PanelScreen
      title="PICO ▸ QUICK MENU"
      hints={[
        { key: "a", label: "SELECT" },
        { key: "b", label: "CLOSE" },
      ]}
      side="right"
      panelTitle="CONTROL CENTER"
      main={<MiniHome games={rail} />}
      panel={<ControlCenter />}
    />
  ),
} satisfies StorySpec
