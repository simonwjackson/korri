import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { DownloadProgress } from "./DownloadProgress"

const target = picoGames[0]

export default {
  render: () => (target ? <DownloadProgress target={target} /> : null),
} satisfies StorySpec
