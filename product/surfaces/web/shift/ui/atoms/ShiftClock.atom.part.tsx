/** Clock atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../../shift-design-parts"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftClock } from "./ShiftClock"

export default {
  designPartId: SHIFT_DESIGN_PARTS.clock.id,
  name: "Clock",
  note: "Status",
  render: () => (
    <ShiftPartFrame height={60}>
      <ShiftClock time="4:24 PM" />
    </ShiftPartFrame>
  ),
}
