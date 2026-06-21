import { picoHero, picoPlayers } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { SessionPlayersHud } from "./SessionPlayersHud"

export default {
  presentation: "surface", // fills its container with an absolute key-art backdrop
  render: () => <SessionPlayersHud game={picoHero} players={picoPlayers} />,
} satisfies StorySpec
