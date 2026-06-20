import type { StorySpec } from "../../story-spec"
import { Toggle } from "./Toggle"

export default {
  render: () => (
    <>
      <Toggle on /> <Toggle on={false} />
    </>
  ),
} satisfies StorySpec
