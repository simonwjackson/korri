import type { StorySpec } from "../../story-spec"
import { Toggle } from "./Toggle"

export default {
  render: () => (
    <>
      <Toggle state="on" /> <Toggle state="off" />
    </>
  ),
} satisfies StorySpec
