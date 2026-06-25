import type { StorySpec } from "../../story-spec"
import { ScreenShell } from "./ScreenShell"

export default {
  note: "statusbar + main + hints",
  render: () => (
    <ScreenShell
      title="PICO ▸ SHELL"
      hints={[
        { key: "a", label: "OK" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pc-dim">page content goes here</div>
    </ScreenShell>
  ),
} satisfies StorySpec
