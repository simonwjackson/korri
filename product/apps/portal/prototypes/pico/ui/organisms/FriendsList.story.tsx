import { picoFriends } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { FriendsList } from "./FriendsList"

export default {
  render: () => <FriendsList friends={picoFriends} />,
} satisfies StorySpec
