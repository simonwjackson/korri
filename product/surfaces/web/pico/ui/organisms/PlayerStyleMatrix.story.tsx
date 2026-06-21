import { picoPlayers } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { PlayerStyleMatrix } from "./PlayerStyleMatrix"

export default {
  render: () => <PlayerStyleMatrix players={picoPlayers} />,
} satisfies StorySpec
