import { picoPlayers } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { SeatAssignList } from "./SeatAssignList"

export default {
  render: () => <SeatAssignList players={picoPlayers} />,
} satisfies StorySpec
