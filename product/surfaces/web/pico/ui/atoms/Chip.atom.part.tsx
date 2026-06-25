import type { StorySpec } from "../../story-spec"
import { Chip } from "./Chip"

export default {
  render: () => (
    <>
      <Chip>ACTION</Chip> <Chip>PUZZLE</Chip> <Chip>CO-OP</Chip>
    </>
  ),
} satisfies StorySpec
