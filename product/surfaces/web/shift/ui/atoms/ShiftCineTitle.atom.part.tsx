import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftCineTitle } from "./ShiftCineTitle"

export default {
  name: "Title",
  render: () => (
    <ShiftPartFrame width={420} height={140}>
      <ShiftCineTitle>Hollow Knight</ShiftCineTitle>
    </ShiftPartFrame>
  ),
}
