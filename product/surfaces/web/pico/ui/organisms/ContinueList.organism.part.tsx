import { picoRecent } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { ContinueList } from "./ContinueList"

const games = picoRecent.slice(0, 5)

export default {
  render: () => <ContinueList games={games} />,
} satisfies StorySpec
