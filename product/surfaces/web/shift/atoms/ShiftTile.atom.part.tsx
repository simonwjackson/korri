import "../config"
import { ShiftTile } from "./ShiftTile"

export default {
  name: "Shift Tile",
  render: () => (
    <div data-shift-home className="intrinsic" style={{ padding: "2rem" }}>
      <ShiftTile aria-label="Shift tile demo" style={{ width: 240, height: 240 }}>
        <img src="https://picsum.photos/seed/shift-tile-part/480/480" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </ShiftTile>
    </div>
  ),
}
