import { picoGames } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { ReactiveStage } from "./ReactiveStage"

const games = picoGames.slice(0, 5)
const focus = 2
const hero = games[focus]

export default {
  presentation: "surface", // full home stage with absolutely-positioned CRT overlay
  render: () => (
    <ReactiveStage
      games={games}
      focus={focus}
      gaze={0}
      state={{ _tag: "Browsing", hero }}
      onPick={() => {}}
      onLaunch={() => {}}
    />
  ),
} satisfies StorySpec
