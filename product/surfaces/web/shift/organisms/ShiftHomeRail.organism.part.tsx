import { games } from "@platform/fixtures/games/games"
import "../config"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"
import { ShiftHomeRail } from "./ShiftHomeRail"

export default {
  name: "Shift Home Rail",
  presentation: "surface" as const,
  render: () => (
    <ShiftHomeRoot items={games}>
      <div className="flex h-full items-center">
        <ShiftHomeRail />
      </div>
    </ShiftHomeRoot>
  ),
}
