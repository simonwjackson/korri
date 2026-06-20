import { picoStats } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { CommunityStatPanel } from "./CommunityStatPanel"

export default {
  render: () => <CommunityStatPanel stats={picoStats} />,
} satisfies StorySpec
