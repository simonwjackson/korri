import { games } from "@platform/fixtures/games/games"
import "../config"
import { ShiftHomeRoot } from "./ShiftHomeRoot"

const slotStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--shift-ink-dim)",
  fontSize: "1.5rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  border: "1px dashed var(--shift-rule)",
  borderRadius: "var(--shift-radius-tile)",
  margin: "1rem",
}

export default {
  name: "Shift Home Root",
  presentation: "surface" as const,
  render: () => (
    <ShiftHomeRoot items={games}>
      <section style={{ ...slotStyle, height: "5rem" }}>TopBar slot</section>
      <section style={{ ...slotStyle, flex: 1 }}>Middle slot</section>
      <section style={{ ...slotStyle, height: "5rem" }}>BottomBar slot</section>
    </ShiftHomeRoot>
  ),
}
