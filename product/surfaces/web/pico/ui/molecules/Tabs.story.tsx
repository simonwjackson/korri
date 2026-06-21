import type { StorySpec } from "../../story-spec"
import { Tabs } from "./Tabs"

export default {
  render: () => <Tabs items={["ALL", "FAVORITES", "RECENT"]} activeIndex={0} />,
} satisfies StorySpec
