import { picoGames } from "../../fixtures"
import { picoPlayers } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { CountdownStage } from "./CountdownStage"

const game = picoGames[0]

export default {
  surface: true, // full key-art backdrop stage
  render: () => <CountdownStage game={game} players={picoPlayers} />,
} satisfies StorySpec
