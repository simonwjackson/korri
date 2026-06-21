import { picoFriends } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { InviteList } from "./InviteList"

export default {
  render: () => <InviteList friends={picoFriends} />,
} satisfies StorySpec
