import { picoHosts } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { HostCardList } from "./HostCardList"

export default {
  render: () => <HostCardList hosts={picoHosts} />,
} satisfies StorySpec
