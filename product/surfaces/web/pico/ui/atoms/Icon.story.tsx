import type { StorySpec } from "../../story-spec"
import { Icon } from "./Icon"

export default {
  note: "play / restart / close / gear",
  render: () => (
    <>
      <Icon name="play" />
      <Icon name="restart" />
      <Icon name="close" />
      <Icon name="gear" />
    </>
  ),
} satisfies StorySpec
