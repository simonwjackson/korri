/** Avatar atom catalog entry. */
import { SHIFT_DESIGN_PARTS } from "../../shift-design-parts"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftAvatar } from "./ShiftAvatar"

export default {
  designPartId: SHIFT_DESIGN_PARTS.avatar.id,
  name: "Avatar",
  note: "Status",
  render: () => (
    <ShiftPartFrame height={80}>
      <ShiftAvatar src="https://i.pravatar.cc/96?u=korri-shift-user" />
    </ShiftPartFrame>
  ),
}
