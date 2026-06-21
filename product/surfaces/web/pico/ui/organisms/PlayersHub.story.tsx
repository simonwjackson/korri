import { picoFriends, picoHero, picoPlayers } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { PlayersHub } from "./PlayersHub"

export default {
  render: () => (
    <PlayersHub game={picoHero} players={picoPlayers} friends={picoFriends} />
  ),
} satisfies StorySpec
