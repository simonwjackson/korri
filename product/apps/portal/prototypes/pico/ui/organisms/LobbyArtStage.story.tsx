import { picoGames } from "../../fixtures"
import { picoPlayers } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { LobbyArtStage } from "./LobbyArtStage"

const game = picoGames[2] // Celeste — has heroUrl + logoUrl

export default {
  surface: true, // absolute key-art backdrop fills the lobby stage
  render: () => <LobbyArtStage game={game} players={picoPlayers} />,
} satisfies StorySpec
