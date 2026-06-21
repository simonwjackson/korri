import type { StorySpec } from "../../story-spec"
import { HudOverlay } from "./HudOverlay"

export default {
  presentation: "surface", // absolutely-positioned corners — needs a sized framed canvas
  render: () => <HudOverlay />,
} satisfies StorySpec
