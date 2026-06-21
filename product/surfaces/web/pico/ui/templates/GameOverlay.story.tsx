import type { StorySpec } from "../../story-spec"
import { GameOverlay } from "./GameOverlay"

export default {
  note: "dimmed game backdrop",
  render: () => (
    <GameOverlay>
      <div className="pcIg-attempt">overlay content</div>
    </GameOverlay>
  ),
} satisfies StorySpec
