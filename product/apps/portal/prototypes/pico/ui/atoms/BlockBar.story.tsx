import type { StorySpec } from "../../story-spec"
import { BlockBar } from "./BlockBar"

export default {
  render: () => <BlockBar level={7} max={10} />,
} satisfies StorySpec
