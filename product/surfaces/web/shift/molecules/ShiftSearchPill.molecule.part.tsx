import "../config"
import { ShiftSearchPill } from "./ShiftSearchPill"

export default {
  name: "Shift Search Pill",
  render: () => (
    <div data-shift-home className="intrinsic" style={{ padding: "2rem" }}>
      <ShiftSearchPill placeholder="Search games" ariaLabel="Search the library" />
    </div>
  ),
}
