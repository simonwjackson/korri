import type { ReactNode } from "react"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftCineLegend } from "./ShiftCineLegend"

const note = "Context"
const frame = (children: ReactNode) => (
  <ShiftPartFrame width={560} height={120}>
    {children}
  </ShiftPartFrame>
)

export const ShiftCineLegendStates = [
  {
    name: "Legend",
    note,
    state: "Browse",
    render: () =>
      frame(
        <ShiftCineLegend
          hints={[
            { glyph: "A", label: "Play", primary: true },
            { glyph: "X", label: "Options" },
            { glyph: "Y", label: "Favorite" },
          ]}
        />,
      ),
  },
  {
    name: "Legend",
    note,
    state: "Failure",
    render: () =>
      frame(
        <ShiftCineLegend
          hints={[
            { glyph: "A", label: "Retry", primary: true },
            { glyph: "B", label: "Back" },
          ]}
        />,
      ),
  },
]
