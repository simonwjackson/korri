import { picoPlayers } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { Player } from "./Player"

const players = picoPlayers.slice(0, 2)

export default {
  note: "mascot / tag rep",
  render: () => (
    <>
      {players[0] ? <Player player={players[0]} /> : null}
      {players[1] ? <Player player={players[1]} rep="tag" /> : null}
    </>
  ),
} satisfies StorySpec
