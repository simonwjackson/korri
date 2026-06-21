import { picoGames } from "../../fixtures"
import { picoFriends } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { ProfileCard } from "./ProfileCard"

export default {
  render: () => <ProfileCard games={picoGames} friends={picoFriends} />,
} satisfies StorySpec
