import type { StorySpec } from "../../story-spec"
import { Tabs } from "./Tabs"

export default {
  render: () => <Tabs items={["ALL", "FAVORITES", "RECENT"]} sel={0} />,
} satisfies StorySpec
