import { picoSeats } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { SeatList } from "./SeatList"

export default {
  render: () => <SeatList seats={picoSeats} />,
} satisfies StorySpec
