import { picoReleases } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { ReleaseList } from "./ReleaseList"

export default {
  render: () => <ReleaseList releases={picoReleases} />,
} satisfies StorySpec
