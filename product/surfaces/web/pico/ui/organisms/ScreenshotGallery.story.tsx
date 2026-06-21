import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { ScreenshotGallery } from "./ScreenshotGallery"

const game = picoGames[0]
const shots = picoGames.slice(0, 5)

export default {
  render: () => (game ? <ScreenshotGallery game={game} shots={shots} /> : null),
} satisfies StorySpec
