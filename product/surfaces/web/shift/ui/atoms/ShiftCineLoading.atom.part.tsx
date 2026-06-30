import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftCineLoading } from "./ShiftCineLoading"

export default {
  name: "Loading",
  note: "Launching shimmer",
  render: () => (
    <ShiftPartFrame width={360} height={100}>
      <ShiftCineLoading />
    </ShiftPartFrame>
  ),
}
