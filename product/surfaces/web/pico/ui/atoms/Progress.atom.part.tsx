import type { StorySpec } from "../../story-spec"
import { Progress } from "./Progress"

export default {
  render: () => (
    <div style={{ width: "16ch" }}>
      <Progress pct={68} />
    </div>
  ),
} satisfies StorySpec
