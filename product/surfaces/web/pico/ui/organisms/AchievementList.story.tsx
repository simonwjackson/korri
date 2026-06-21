import { picoAchievements } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { AchievementList } from "./AchievementList"

export default {
  render: () => <AchievementList achievements={picoAchievements} />,
} satisfies StorySpec
