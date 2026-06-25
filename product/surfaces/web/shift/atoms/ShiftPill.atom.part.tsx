import "../config"
import { ShiftPill } from "./ShiftPill"

export default {
  name: "Shift Pill",
  render: () => (
    <div data-shift-home className="intrinsic" style={{ padding: "2rem" }}>
      <ShiftPill>Search games</ShiftPill>
    </div>
  ),
}
