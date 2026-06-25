import { picoGames } from "../../fixtures"
import { picoPlayers } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { InlineSeatStrip } from "./InlineSeatStrip"

const games = picoGames.slice(0, 5)

export default {
  render: () => <InlineSeatStrip games={games} players={picoPlayers} />,
} satisfies StorySpec
