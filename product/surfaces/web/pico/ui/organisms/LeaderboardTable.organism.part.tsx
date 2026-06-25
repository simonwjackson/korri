import { picoScores } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { LeaderboardTable } from "./LeaderboardTable"

export default {
  render: () => <LeaderboardTable scores={picoScores} />,
} satisfies StorySpec
