import { picoHero, picoPlayers } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { PlayerToast } from "./PlayerToast"

export default {
  presentation: "surface", // KeyArtBackdrop fills + absolutely-positioned toast
  render: () => <PlayerToast game={picoHero} players={picoPlayers} />,
} satisfies StorySpec
